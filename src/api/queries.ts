import { findFileByHash, getAuthoredRow, getPluginRow, listFiles } from "@/storage/db";
import { pluginRegistry } from "@/plugins/registry";

export function getFileDetail(hash: string) {
  const file = findFileByHash(hash);
  if (!file) return undefined;

  const pluginData: Record<string, unknown> = {};
  for (const plugin of pluginRegistry) {
    if (!plugin.schema) continue;
    const row = getPluginRow(plugin.schema.table, hash);
    if (row) pluginData[plugin.id] = row;
  }
  return { ...file, authored: getAuthoredRow(hash) ?? null, plugins: pluginData };
}

export function listFilesPage(limit: number, offset: number) {
  const files = listFiles(limit, offset);
  return files.map((file) => {
    const core = getPluginRow("core_metadata", file.hash);
    return { ...file, ...core };
  });
}
