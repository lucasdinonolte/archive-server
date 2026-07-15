import type { Plugin } from './types';
import { stat } from 'node:fs/promises';

export const coreMetadataPlugin: Plugin = {
  id: "core-metadata",
  version: 1,
  appliesTo: () => true,
  schema: {
    table: "core_metadata",
    columns: [
      { name: "size_bytes", type: "INTEGER" },
      { name: "content_type", type: "TEXT" },
      { name: "mtime_ms", type: "REAL" },
    ],
  },
  analyze: async (ctx) => {
    const { mtimeMs } = await stat(ctx.storagePath);
    return { size_bytes: ctx.sizeBytes, content_type: ctx.contentType, mtime_ms: mtimeMs };
  },
  project: (data) => ({
    contentType: data.content_type as string,
    sizeBytes: data.size_bytes as number,
  }),
};
