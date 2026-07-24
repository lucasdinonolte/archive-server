import { stat } from "node:fs/promises";
import path from "node:path";

import { config } from "@/config";
import { waitUntilStable } from "@/stability";

import type { BlobStorage } from "@/storage/blobStorage";
import { findFileByHash } from "@/storage/db";
import type { JobQueue } from "@/storage/jobQueue";
import { guessContentType } from "@/mime";

import { applyPlugins } from "@/applyPlugins";
import { pluginRegistry } from "@/plugins/registry";
import type { FileContext } from "@/plugins/types";

import { logger } from "@/utils/logger";
import { unlink } from "node:fs/promises";

export async function ingestFile(filename: string, storage: BlobStorage, jobQueue?: JobQueue): Promise<void> {
  const incomingPath = path.join(config.incomingDir, filename);

  try {
    await waitUntilStable(incomingPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const hash = await storage.hashFile(incomingPath);
  const ext = path.extname(filename);

  const existing = findFileByHash(hash);
  if (existing) {
    logger.warn(
      `Duplicate content for ${filename} (${hash.slice(0, 12)}...) ` +
      `already archived as ${existing.originalFilename} - discarding`
    );
    await unlink(incomingPath);
    return;
  }

  const storagePath = await storage.ingestBlob(incomingPath, { hash, ext });
  const { size, mtimeMs } = await stat(storagePath);
  const ingestedAt = new Date().toISOString();
  const ctx: FileContext = {
    hash,
    ext,
    storagePath,
    originalFilename: filename,
    sizeBytes: size,
    contentType: guessContentType(storagePath),
    mtimeMs,
  };

  const applicable = pluginRegistry.filter((plugin) => plugin.appliesTo(ctx));

  if (jobQueue) {
    // Split into sync (run inline) and async (enqueue as jobs)
    const syncPlugins = applicable.filter((p) => p.phase === "sync");
    const asyncPlugins = applicable.filter((p) => p.phase !== "sync");

    if (syncPlugins.length > 0) {
      await applyPlugins(ctx, syncPlugins, ingestedAt, storage);
    }

    for (const plugin of asyncPlugins) {
      jobQueue.enqueue(hash, plugin.id);
    }
  } else {
    // No job queue — run all plugins inline (legacy behavior)
    await applyPlugins(ctx, applicable, ingestedAt, storage);
  }

  logger.success(`Ingested ${filename} -> ${storagePath} (${hash.slice(0, 12)}...)`);
}
