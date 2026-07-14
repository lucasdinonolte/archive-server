import { pluginRegistry } from "@/plugins/registry";
import { decodeSidecarEntry, listSidecarHashes, readSidecar } from "@/storage/cas";
import { insertFileRecord, rebuildSchema, upsertPluginRow } from "@/storage/db";
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

    for (const plugin of pluginRegistry) {
      if (!plugin.schema) continue;
      const entry = sidecar.plugins[plugin.id];
      if (!entry) continue;
      upsertPluginRow(plugin.schema, hash, decodeSidecarEntry(plugin.schema, entry));
    }

    restored++;
  }

  logger.success(`Rebuilt database from ${restored} sidecar(s)`);
}
