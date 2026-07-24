import { stat } from "node:fs/promises";

import { guessContentType } from "@/mime";
import { pluginRegistry } from "@/plugins/registry";
import type { BlobStorage } from "@/storage/blobStorage";
import { JobQueue } from "@/storage/jobQueue";
import { logger } from "@/utils/logger";

/**
 * Scans sidecars for stale plugins and enqueues them as jobs. The worker
 * picks them up. The UNIQUE(file_hash, plugin_id) constraint makes this
 * idempotent — re-running backfill never creates duplicate jobs.
 */
export async function backfill(storage: BlobStorage, jobQueue: JobQueue): Promise<void> {
  const hashes = await storage.listSidecarHashes();
  let queued = 0;

  const entries: Array<{ fileHash: string; pluginId: string }> = [];

  for (const hash of hashes) {
    const sidecar = await storage.readSidecar(hash);
    if (!sidecar) continue;

    const fileStat = await stat(sidecar.storagePath).catch(() => undefined);
    if (!fileStat) {
      logger.warn(`Backfill: ${hash.slice(0, 12)}... has a sidecar but no file at ${sidecar.storagePath}, skipping`);
      continue;
    }

    const ext = sidecar.storagePath.match(/\.[^.]+$/)?.[0] ?? "";
    const ctx = {
      hash: sidecar.hash,
      ext,
      storagePath: sidecar.storagePath,
      originalFilename: sidecar.originalFilename,
      sizeBytes: fileStat.size,
      contentType: guessContentType(sidecar.storagePath),
      mtimeMs: fileStat.mtimeMs,
    };

    const stale = pluginRegistry.filter((plugin) => {
      if (!plugin.appliesTo(ctx)) return false;
      const entry = sidecar.plugins[plugin.id];
      return !entry || entry.version < plugin.version;
    });
    if (stale.length === 0) continue;

    queued++;
    logger.info(`Backfill: ${hash.slice(0, 12)}... needs ${stale.map((p) => p.id).join(", ")}`);
    for (const plugin of stale) {
      entries.push({ fileHash: hash, pluginId: plugin.id });
    }
  }

  if (entries.length > 0) {
    jobQueue.enqueueMany(entries);
  }

  logger.info(`Backfill: enqueued ${queued}/${hashes.length} file(s)`);
}
