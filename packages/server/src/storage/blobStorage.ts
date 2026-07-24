import { Readable } from "node:stream";

import type { AuthoredMetadata, Sidecar, SidecarRecord } from "./cas";

export type BlobRef = { hash: string; ext: string };

export type DerivedRef = {
  hash: string;
  signature: string;
  ext: string;
};

export type BundleRef = { hash: string; signature: string };

export interface BlobStorage {
  // --- Primary blobs ---
  ingestBlob(sourcePath: string, ref: BlobRef): Promise<string>;
  hasBlob(ref: BlobRef): Promise<boolean>;
  createReadStream(ref: BlobRef, opts?: { start?: number; end?: number }): Promise<Readable>;
  blobSize(ref: BlobRef): Promise<number>;
  /** Local path for libs that need fs access (sharp, CLIP). On S3: downloads to temp. */
  localPath(ref: BlobRef): Promise<string>;

  // --- Sidecars ---
  readSidecar(hash: string): Promise<Sidecar | undefined>;
  writeSidecar(record: SidecarRecord): Promise<void>;
  listSidecarHashes(): Promise<string[]>;

  // --- Authored metadata ---
  readAuthored(hash: string): Promise<AuthoredMetadata | undefined>;
  writeAuthored(record: Omit<AuthoredMetadata, "formatVersion">): Promise<void>;

  // --- Derived artifacts ---
  readDerived(ref: DerivedRef): Promise<Buffer | undefined>;
  writeDerived(ref: DerivedRef, data: Buffer): Promise<void>;
  hasDerived(ref: DerivedRef): Promise<boolean>;

  // --- Bundles ---
  readBundleEntry(bundle: BundleRef, entry: string): Promise<Buffer | undefined>;
  writeBundle(bundle: BundleRef, entries: Map<string, Buffer>): Promise<void>;
  hasBundle(bundle: BundleRef): Promise<boolean>;

  // --- Hashing ---
  hashFile(filePath: string): Promise<string>;
}
