import type { PublicFileDetail, PublicFileListItem } from '@archive/shared';

import { findFileByHash, getFileCustomFields, getFileTags, getPluginRow, listFiles, listFilesFiltered } from "@/storage/db";
import type { FileRecord, FileFilter } from "@/storage/db";
import { pluginRegistry } from "@/plugins/registry";

function toListItem(file: FileRecord): PublicFileListItem {
  const tags = getFileTags(file.hash);
  const customFields = getFileCustomFields(file.hash);
  return {
    hash: file.hash,
    originalFilename: file.originalFilename,
    ingestedAt: file.ingestedAt,
    tags,
    customFields,
    project: file.project,
    contentType: file.contentType ?? undefined,
    sizeBytes: file.sizeBytes ?? undefined,
    width: file.width ?? undefined,
    height: file.height ?? undefined,
    format: file.format ?? undefined,
    colorSpace: file.colorSpace ?? undefined,
    dpi: file.dpi ?? undefined,
    dominantColor: file.dominantColor ?? undefined,
  };
}

export function getFileDetail(hash: string): PublicFileDetail | undefined {
  const file = findFileByHash(hash);
  if (!file) return undefined;

  const plugins: Record<string, unknown> = {};
  for (const plugin of pluginRegistry) {
    if (!plugin.schema) continue;
    const row = getPluginRow(plugin.schema.table, file.hash);
    if (row) plugins[plugin.id] = row;
  }

  return { ...toListItem(file), plugins };
}

export function listFilesPage(limit: number, offset: number, filter?: FileFilter): PublicFileListItem[] {
  const hasFilter = filter?.tags?.length || filter?.projects?.length || (filter?.customFields && Object.keys(filter.customFields).length > 0);
  const files = hasFilter ? listFilesFiltered(limit, offset, filter!) : listFiles(limit, offset);
  return files.map(toListItem);
}
