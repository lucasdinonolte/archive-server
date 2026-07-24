import type { ColumnType, ColumnValue, JSONValue, PluginResult, PluginSchema } from "@/plugins/types";

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

/** The writable subset of a Sidecar (no formatVersion — storage adds that). */
export type SidecarRecord = {
  hash: string;
  originalFilename: string;
  ingestedAt: string;
  storagePath: string;
  plugins: Record<string, SidecarPluginEntry>;
};

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

function toJsonSafe(value: ColumnValue): JSONValue {
  return Buffer.isBuffer(value) ? value.toString("base64") : value;
}

/**
 * Inverse of {@link toJsonSafe}: reconstructs a stored column value from its
 * JSON form. A BLOB is a base64 string on disk and must be decoded back to a
 * Buffer; every other column type is stored (and returned) verbatim.
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
 * plugin's schema to know which columns are BLOBs.
 */
export function decodeSidecarEntry(schema: PluginSchema, entry: SidecarPluginEntry): Record<string, ColumnValue> {
  return Object.fromEntries(
    schema.columns.map((c) => [c.name, fromJsonSafe(entry.data[c.name] ?? null, c.type)])
  );
}

/** v1 legacy sidecar: same top-level fields, but each `plugins` entry is the raw data map with no envelope. */
type LegacySidecar = Omit<Sidecar, "formatVersion" | "plugins"> & {
  formatVersion?: undefined;
  plugins: Record<string, Record<string, JSONValue>>;
};

export function normalizeSidecar(parsed: Sidecar | LegacySidecar): Sidecar {
  if (parsed.formatVersion === SIDECAR_FORMAT) return parsed as Sidecar;

  const plugins: Record<string, SidecarPluginEntry> = {};
  for (const [pluginId, data] of Object.entries(parsed.plugins)) {
    plugins[pluginId] = { version: 0, computedAt: parsed.ingestedAt, data: data as Record<string, JSONValue> };
  }
  return { ...parsed, formatVersion: 1, plugins };
}
