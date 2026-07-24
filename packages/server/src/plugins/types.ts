import type { Readable } from 'node:stream';
import type { ProjectedFields } from '@archive/shared';
import type { BlobStorage } from '@/storage/blobStorage';

export type FileContext = {
  hash: string;
  ext: string;
  storagePath: string;
  originalFilename: string;
  sizeBytes: number;
  contentType: string;
  mtimeMs: number;
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

export type PluginPhase = "sync" | "async";

export type ServingContext = {
  hash: string;
  ext: string;
  contentType: string;
  originalFilename: string;
  requestPath: string;
  query: Record<string, string>;
  range?: string;
};

export type ServingAPI = {
  localPath: () => Promise<string>;
  blobSize: () => Promise<number>;
  createReadStream: (opts?: { start?: number; end?: number }) => Promise<Readable>;
  readDerived: (signature: string, ext: string) => Promise<Buffer | undefined>;
  writeDerived: (signature: string, ext: string, data: Buffer) => Promise<void>;
  hasDerived: (signature: string, ext: string) => Promise<boolean>;
};

export type ServingResult = {
  status: number;
  headers: Record<string, string>;
  body: Buffer | ReadableStream | Uint8Array;
};

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
  project?: (
    data: Record<string, ColumnValue>,
    ctx: Partial<ProjectedFields>,
  ) => Partial<ProjectedFields>;
  phase?: PluginPhase;
  serving?: {
    formats: string[];
    version?: number;
    serve: (ctx: ServingContext, api: ServingAPI) => Promise<ServingResult | null>;
  };
  thumbnail?: {
    contentType: string;
    generate: (ctx: FileContext, storage: BlobStorage) => Promise<Buffer | null>;
  };
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
