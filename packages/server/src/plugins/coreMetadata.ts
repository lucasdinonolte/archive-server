import type { Plugin } from './types';

export const coreMetadataPlugin: Plugin = {
  id: "core-metadata",
  version: 1,
  phase: "sync",
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
    return { size_bytes: ctx.sizeBytes, content_type: ctx.contentType, mtime_ms: ctx.mtimeMs };
  },
  project: (data) => ({
    contentType: data.content_type as string,
    sizeBytes: data.size_bytes as number,
  }),
};
