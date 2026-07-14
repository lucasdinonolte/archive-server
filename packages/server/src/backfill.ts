import { stat } from "node:fs/promises";

import { applyPlugins } from "@/applyPlugins";
import { guessContentType } from "@/mime";
import { pluginRegistry } from "@/plugins/registry";
import type { FileContext } from "@/plugins/types";
import { TaskQueue } from "@/queue";
import { listSidecarHashes, readSidecar } from "@/storage/cas";
import { logger } from "@/utils/logger";

/**
 * Applies any new or updated plugins to files already in the archive. For each
 * sidecar it recomputes the subset of plugins that apply but whose stored result
 * is missing or older than the plugin's current version, and enqueues the work.
 *
 * Idempotent: files already up to date are skipped, and a crashed run just
 * re-runs the same stale subset. Reads exclusively from sidecars, so it works
 * regardless of database state.
 */
export async function backfill(queue: TaskQueue): Promise<void> {
  const hashes = await listSidecarHashes();
  let queued = 0;

  for (const hash of hashes) {
    const sidecar = await readSidecar(hash);
    if (!sidecar) continue;

    const fileStat = await stat(sidecar.storagePath).catch(() => undefined);
    if (!fileStat) {
      logger.warn(`Backfill: ${hash.slice(0, 12)}... has a sidecar but no file at ${sidecar.storagePath}, skipping`);
      continue;
    }

    const ctx: FileContext = {
      hash: sidecar.hash,
      storagePath: sidecar.storagePath,
      originalFilename: sidecar.originalFilename,
      sizeBytes: fileStat.size,
      contentType: guessContentType(sidecar.storagePath),
    };

    const stale = pluginRegistry.filter((plugin) => {
      if (!plugin.appliesTo(ctx)) return false;
      const entry = sidecar.plugins[plugin.id];
      return !entry || entry.version < plugin.version;
    });
    if (stale.length === 0) continue;

    queued++;
    logger.info(`Backfill: ${hash.slice(0, 12)}... needs ${stale.map((p) => p.id).join(", ")}`);
    queue.push(() => applyPlugins(ctx, stale, sidecar.ingestedAt));
  }

  logger.info(`Backfill: queued ${queued}/${hashes.length} file(s)`);
}
