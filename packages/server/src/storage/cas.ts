import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ColumnType, ColumnValue, JSONValue, PluginResult, PluginSchema } from "@/plugins/types";
import { config } from "@/config";

/** Current sidecar format. v1 was a flat `plugins` map with no provenance; v2 wraps each plugin's data in a versioned envelope. */
export const SIDECAR_FORMAT = 2;

/** A single plugin's persisted output plus its provenance. BLOBs are base64 in `data`. */
export type SidecarPluginEntry = {
  version: number;
  computedAt: string;
  data: Record<string, JSONValue>;
};

/**
 * On-disk sidecar shape. This file is the source of truth for a stored asset —
 * the SQLite database is a derived index that can be rebuilt from it. BLOB
 * columns are held as base64 strings here (see {@link toJsonSafe}); decode them
 * with {@link fromJsonSafe} using the owning plugin's column types.
 */
export type Sidecar = {
  formatVersion: number;
  hash: string;
  originalFilename: string;
  ingestedAt: string;
  storagePath: string;
  plugins: Record<string, SidecarPluginEntry>;
};

export function casPathForHash(hash: string, ext: string): string {
  return path.join(config.storageDir, hash.slice(0, 2), hash.slice(2, 4), `${hash}${ext}`);
}

export function sidecarPathForHash(hash: string): string {
  return path.join(config.storageDir, hash.slice(0, 2), hash.slice(2, 4), `${hash}.data.json`);
}

/** Current authored-sidecar format. */
export const AUTHORED_FORMAT = 1;

/**
 * Hand-authored metadata for a file. Unlike the plugin sidecar this is NOT
 * recomputable — it lives in its own file so the plugin write path can never
 * touch it, and it is the source of truth for the `authored_metadata` DB index.
 */
export type AuthoredMetadata = {
  formatVersion: number;
  hash: string;
  project: string | null;
  tags: string[];
  customFields: Record<string, string>;
  updatedAt: string;
};

export function authoredPathForHash(hash: string): string {
  return path.join(config.storageDir, hash.slice(0, 2), hash.slice(2, 4), `${hash}.authored.json`);
}

/** Reads a file's authored metadata, or undefined if none has been written yet. */
export async function readAuthored(hash: string): Promise<AuthoredMetadata | undefined> {
  let raw: string;
  try {
    raw = await readFile(authoredPathForHash(hash), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  return JSON.parse(raw) as AuthoredMetadata;
}

/** Atomically writes a file's authored metadata (tmp + rename), mirroring {@link writeSidecar}. */
export async function writeAuthored(record: Omit<AuthoredMetadata, "formatVersion">): Promise<void> {
  const authored: AuthoredMetadata = { formatVersion: AUTHORED_FORMAT, ...record };
  const finalPath = authoredPathForHash(record.hash);
  const tmpPath = `${finalPath}.tmp-${process.pid}`;
  await mkdir(path.dirname(finalPath), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(authored, null, 2));
  await rename(tmpPath, finalPath);
}

function toJsonSafe(value: ColumnValue): JSONValue {
  // BLOB columns (e.g. a packed embedding) can't be represented in JSON -
  // base64 is the documented convention for this sidecar specifically.
  return Buffer.isBuffer(value) ? value.toString("base64") : value;
}

/**
 * Inverse of {@link toJsonSafe}: reconstructs a stored column value from its
 * JSON form. A BLOB is a base64 string on disk and must be decoded back to a
 * Buffer; every other column type is stored (and returned) verbatim. The column
 * type is what disambiguates a base64 BLOB from a genuine TEXT string, so the
 * caller must supply it from the owning plugin's schema.
 */
export function fromJsonSafe(value: JSONValue, type: ColumnType): ColumnValue {
  return type === "BLOB" && typeof value === "string"
    ? Buffer.from(value, "base64")
    : value;
}

/** Encodes an in-memory plugin result (Buffers and all) into its persisted sidecar form. */
export function encodePluginResult(result: PluginResult): SidecarPluginEntry {
  return {
    version: result.version,
    computedAt: result.computedAt,
    data: Object.fromEntries(
      Object.entries(result.data).map(([key, value]) => [key, toJsonSafe(value)])
    ),
  };
}

/**
 * Decodes a persisted sidecar entry back into database column values, using the
 * plugin's schema to know which columns are BLOBs. This is what makes a DB
 * rebuild lossless — the inverse of {@link encodePluginResult} at the row level.
 */
export function decodeSidecarEntry(schema: PluginSchema, entry: SidecarPluginEntry): Record<string, ColumnValue> {
  return Object.fromEntries(
    schema.columns.map((c) => [c.name, fromJsonSafe(entry.data[c.name] ?? null, c.type)])
  );
}

export async function moveIntoStorage(sourcePath: string, hash: string, ext: string): Promise<string> {
  const destPath = casPathForHash(hash, ext);
  await mkdir(path.dirname(destPath), { recursive: true });
  await rename(sourcePath, destPath);
  return destPath;
}

export async function writeSidecar(record: {
  hash: string; originalFilename: string; ingestedAt: string; storagePath: string;
  plugins: Record<string, SidecarPluginEntry>;
}): Promise<void> {
  const sidecar: Sidecar = {
    formatVersion: SIDECAR_FORMAT,
    hash: record.hash,
    originalFilename: record.originalFilename,
    ingestedAt: record.ingestedAt,
    storagePath: record.storagePath,
    plugins: record.plugins,
  };

  const finalPath = sidecarPathForHash(record.hash);
  const tmpPath = `${finalPath}.tmp-${process.pid}`;
  await mkdir(path.dirname(finalPath), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(sidecar, null, 2));
  await rename(tmpPath, finalPath);
}

/**
 * Reads and parses the sidecar for a hash, or returns undefined if none exists
 * yet. Legacy v1 sidecars (flat `plugins` map, no provenance) are normalized to
 * the envelope shape with version 0, so every plugin in them reads as stale and
 * gets re-run on the next backfill. BLOB values remain base64 strings; decode
 * them with {@link fromJsonSafe} once you know each column's type.
 */
export async function readSidecar(hash: string): Promise<Sidecar | undefined> {
  let raw: string;
  try {
    raw = await readFile(sidecarPathForHash(hash), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  return normalizeSidecar(JSON.parse(raw));
}

/**
 * Lists the hashes of every archived file by scanning for sidecars. The sidecars
 * are the authoritative file list — this works even if the database was deleted,
 * which is exactly what a rebuild depends on.
 */
export async function listSidecarHashes(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(config.storageDir, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((e) => e.endsWith(".data.json"))
    .map((e) => path.basename(e, ".data.json"));
}

/** v1 legacy sidecar: same top-level fields, but each `plugins` entry is the raw data map with no envelope. */
type LegacySidecar = Omit<Sidecar, "formatVersion" | "plugins"> & {
  formatVersion?: undefined;
  plugins: Record<string, Record<string, JSONValue>>;
};

function normalizeSidecar(parsed: Sidecar | LegacySidecar): Sidecar {
  if (parsed.formatVersion === SIDECAR_FORMAT) return parsed;

  const plugins: Record<string, SidecarPluginEntry> = {};
  for (const [pluginId, data] of Object.entries(parsed.plugins)) {
    plugins[pluginId] = { version: 0, computedAt: parsed.ingestedAt, data: data as Record<string, JSONValue> };
  }
  return { ...parsed, formatVersion: 1, plugins };
}
