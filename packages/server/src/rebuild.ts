import { pluginRegistry } from "@/plugins/registry";
import { decodeSidecarEntry, listSidecarHashes, readAuthored, readSidecar } from "@/storage/cas";
import {
  insertFileRecord,
  rebuildSchema,
  replaceCustomFields,
  replaceTags,
  updateAuthoredFields,
  updateProjectedFields,
  upsertPluginRow,
} from "@/storage/db";
import { computeProjectedFields, extractClipTags } from "@/projection";
import { logger } from "@/utils/logger";

/**
 * Regenerates the entire database from the sidecars. Drops the derived tables,
 * recreates the current schema, and replays every sidecar as-is — it does not
 * re-run plugins (that is backfill's job), it only re-indexes what was already
 * computed. This is what makes the database a disposable, rebuildable index.
 */
export async function rebuildDb(): Promise<void> {
  const schemas = pluginRegistry.flatMap((plugin) => (plugin.schema ? [plugin.schema] : []));
  rebuildSchema(schemas);

  const hashes = await listSidecarHashes();
  let restored = 0;

  for (const hash of hashes) {
    const sidecar = await readSidecar(hash);
    if (!sidecar) continue;

    insertFileRecord({
      hash: sidecar.hash,
      storagePath: sidecar.storagePath,
      originalFilename: sidecar.originalFilename,
      ingestedAt: sidecar.ingestedAt,
    });

    // Decode plugin data and insert plugin rows.
    const pluginData: Record<string, Record<string, import("@/plugins/types").ColumnValue>> = {};
    for (const plugin of pluginRegistry) {
      if (!plugin.schema) continue;
      const entry = sidecar.plugins[plugin.id];
      if (!entry) continue;
      const decoded = decodeSidecarEntry(plugin.schema, entry);
      upsertPluginRow(plugin.schema, hash, decoded);
      pluginData[plugin.id] = decoded;
    }

    // Compute and store projected fields from decoded plugin data.
    const projected = computeProjectedFields(pluginRegistry, pluginData);
    updateProjectedFields(hash, projected);

    // Extract CLIP tags into the normalized tags table.
    if (pluginData['image-clip']) {
      const clipTags = extractClipTags(pluginData['image-clip']);
      replaceTags(hash, 'clip', clipTags);
    }

    // Restore authored metadata.
    const authored = await readAuthored(hash);
    if (authored) {
      updateAuthoredFields(hash, authored.project, authored.updatedAt);
      replaceTags(hash, 'authored', authored.tags);
      replaceCustomFields(hash, authored.customFields ?? {});
    }

    restored++;
  }

  logger.success(`Rebuilt database from ${restored} sidecar(s)`);
}
