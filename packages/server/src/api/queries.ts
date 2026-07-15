import type { ProjectedFields, PublicFile } from '@archive/shared';

import { findFileByHash, getAuthoredRow, getPluginRow, listFiles } from "@/storage/db";
import type { FileRecord } from "@/storage/db";
import { pluginRegistry } from "@/plugins/registry";
import type { ColumnValue } from "@/plugins/types";

function assemblePublicFile(file: FileRecord): PublicFile {
  const authored = getAuthoredRow(file.hash);
  let ctx: Partial<ProjectedFields> = {
    project: authored?.project ?? null,
    tags: authored?.tags ?? [],
  };

  const plugins: Record<string, unknown> = {};

  for (const plugin of pluginRegistry) {
    if (!plugin.schema) continue;
    const row = getPluginRow(plugin.schema.table, file.hash);
    if (!row) continue;
    plugins[plugin.id] = row;
    if (plugin.project) {
      ctx = { ...ctx, ...plugin.project(row as Record<string, ColumnValue>, { ...ctx }) };
    }
  }

  const { storagePath, ...rest } = file;
  return { ...rest, ...ctx, plugins };
}

export function getFileDetail(hash: string): PublicFile | undefined {
  const file = findFileByHash(hash);
  if (!file) return undefined;
  return assemblePublicFile(file);
}

export function listFilesPage(limit: number, offset: number): PublicFile[] {
  const files = listFiles(limit, offset);
  return files.map(assemblePublicFile);
}
