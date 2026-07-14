export type FileContext = {
  hash: string;
  storagePath: string;
  originalFilename: string;
  sizeBytes: number;
  contentType: string;
};

export type ColumnType = "TEXT" | "INTEGER" | "REAL" | "BLOB";

export type ColumnDefinition = {
  name: string;
  type: ColumnType;
  nullable?: boolean;
}

export type PluginSchema = {
  table: string;
  columns: ColumnDefinition[];
};

export type JSONValue = string | number | boolean | null;
export type ColumnValue = JSONValue | Buffer;

export type Plugin = {
  id: string;
  /**
   * Bump whenever analyze()'s output changes meaning (new model, new columns,
   * different scoring). A file whose stored result predates the current version
   * is treated as stale and re-run on the next backfill.
   */
  version: number;
  appliesTo: (fileContext: FileContext) => boolean;
  schema?: PluginSchema;
  analyze: (fileContext: FileContext) => Promise<Record<string, ColumnValue>>;
}

/**
 * A plugin's analysis plus the provenance needed to decide, later, whether it
 * must be recomputed. In-memory shape: data holds Buffers. The sidecar persists
 * the same envelope with BLOB values base64-encoded.
 */
export type PluginResult = {
  version: number;
  computedAt: string;
  data: Record<string, ColumnValue>;
}
