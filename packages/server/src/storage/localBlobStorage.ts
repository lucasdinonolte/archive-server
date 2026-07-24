import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  AUTHORED_FORMAT,
  SIDECAR_FORMAT,
  normalizeSidecar,
  type AuthoredMetadata,
  type Sidecar,
  type SidecarRecord,
} from "./cas";
import type { BlobStorage, BlobRef, BundleRef, DerivedRef } from "./blobStorage";

export class LocalBlobStorage implements BlobStorage {
  constructor(private storageDir: string) {}

  // ── Path helpers ──────────────────────────────────────────────────────

  private casPath(ref: BlobRef): string {
    return path.join(this.storageDir, ref.hash.slice(0, 2), ref.hash.slice(2, 4), `${ref.hash}${ref.ext}`);
  }

  private sidecarPath(hash: string): string {
    return path.join(this.storageDir, hash.slice(0, 2), hash.slice(2, 4), `${hash}.data.json`);
  }

  private authoredPath(hash: string): string {
    return path.join(this.storageDir, hash.slice(0, 2), hash.slice(2, 4), `${hash}.authored.json`);
  }

  private derivedPath(ref: DerivedRef): string {
    return path.join(
      this.storageDir,
      ".derived",
      "variants",
      ref.hash.slice(0, 2),
      `${ref.hash}-${ref.signature}${ref.ext}`,
    );
  }

  private bundleDir(bundle: BundleRef): string {
    return path.join(
      this.storageDir,
      ".derived",
      "bundles",
      bundle.hash.slice(0, 2),
      `${bundle.hash}-${bundle.signature}`,
    );
  }

  // ── Primary blobs ────────────────────────────────────────────────────

  async ingestBlob(sourcePath: string, ref: BlobRef): Promise<string> {
    const destPath = this.casPath(ref);
    await mkdir(path.dirname(destPath), { recursive: true });
    await rename(sourcePath, destPath);
    return destPath;
  }

  async hasBlob(ref: BlobRef): Promise<boolean> {
    try {
      await stat(this.casPath(ref));
      return true;
    } catch {
      return false;
    }
  }

  async createReadStream(ref: BlobRef, opts?: { start?: number; end?: number }): Promise<Readable> {
    return createReadStream(this.casPath(ref), opts);
  }

  async blobSize(ref: BlobRef): Promise<number> {
    const { size } = await stat(this.casPath(ref));
    return size;
  }

  async localPath(ref: BlobRef): Promise<string> {
    return this.casPath(ref);
  }

  // ── Sidecars ─────────────────────────────────────────────────────────

  async readSidecar(hash: string): Promise<Sidecar | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.sidecarPath(hash), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
    return normalizeSidecar(JSON.parse(raw));
  }

  async writeSidecar(record: SidecarRecord): Promise<void> {
    const sidecar: Sidecar = {
      formatVersion: SIDECAR_FORMAT,
      hash: record.hash,
      originalFilename: record.originalFilename,
      ingestedAt: record.ingestedAt,
      storagePath: record.storagePath,
      plugins: record.plugins,
    };

    const finalPath = this.sidecarPath(record.hash);
    const tmpPath = `${finalPath}.tmp-${process.pid}`;
    await mkdir(path.dirname(finalPath), { recursive: true });
    await writeFile(tmpPath, JSON.stringify(sidecar, null, 2));
    await rename(tmpPath, finalPath);
  }

  async listSidecarHashes(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.storageDir, { recursive: true }) as string[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    return entries
      .filter((e) => e.endsWith(".data.json"))
      .map((e) => path.basename(e, ".data.json"));
  }

  // ── Authored metadata ────────────────────────────────────────────────

  async readAuthored(hash: string): Promise<AuthoredMetadata | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.authoredPath(hash), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
    return JSON.parse(raw) as AuthoredMetadata;
  }

  async writeAuthored(record: Omit<AuthoredMetadata, "formatVersion">): Promise<void> {
    const authored: AuthoredMetadata = { formatVersion: AUTHORED_FORMAT, ...record };
    const finalPath = this.authoredPath(record.hash);
    const tmpPath = `${finalPath}.tmp-${process.pid}`;
    await mkdir(path.dirname(finalPath), { recursive: true });
    await writeFile(tmpPath, JSON.stringify(authored, null, 2));
    await rename(tmpPath, finalPath);
  }

  // ── Derived artifacts ────────────────────────────────────────────────

  async readDerived(ref: DerivedRef): Promise<Buffer | undefined> {
    try {
      return await readFile(this.derivedPath(ref));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async writeDerived(ref: DerivedRef, data: Buffer): Promise<void> {
    const finalPath = this.derivedPath(ref);
    const tmpPath = `${finalPath}.tmp-${process.pid}`;
    await mkdir(path.dirname(finalPath), { recursive: true });
    await writeFile(tmpPath, data);
    await rename(tmpPath, finalPath);
  }

  async hasDerived(ref: DerivedRef): Promise<boolean> {
    try {
      await stat(this.derivedPath(ref));
      return true;
    } catch {
      return false;
    }
  }

  // ── Bundles ──────────────────────────────────────────────────────────

  async readBundleEntry(bundle: BundleRef, entry: string): Promise<Buffer | undefined> {
    try {
      return await readFile(path.join(this.bundleDir(bundle), entry));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async writeBundle(bundle: BundleRef, entries: Map<string, Buffer>): Promise<void> {
    const finalDir = this.bundleDir(bundle);
    const tmpDir = `${finalDir}.tmp-${process.pid}`;
    await mkdir(tmpDir, { recursive: true });
    for (const [name, data] of entries) {
      await writeFile(path.join(tmpDir, name), data);
    }
    await rename(tmpDir, finalDir);
  }

  async hasBundle(bundle: BundleRef): Promise<boolean> {
    try {
      await stat(this.bundleDir(bundle));
      return true;
    } catch {
      return false;
    }
  }

  // ── Hashing ──────────────────────────────────────────────────────────

  async hashFile(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    await pipeline(createReadStream(filePath), hash);
    return hash.digest("hex");
  }
}
