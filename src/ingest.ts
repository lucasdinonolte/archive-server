import { stat, unlink } from "node:fs/promises";
import path from "node:path";

import { config } from "@/config";
import { waitUntilStable } from "@/stability";
import { sha256File } from "@/hash";

import { moveIntoStorage } from "@/storage/cas";
import { findFileByHash } from "@/storage/db";
import { guessContentType } from "@/mime";

import { applyPlugins } from "@/applyPlugins";
import { pluginRegistry } from "@/plugins/registry";
import type { FileContext } from "@/plugins/types";

import { logger } from "@/utils/logger";

export async function ingestFile(filename: string): Promise<void> {
  const incomingPath = path.join(config.incomingDir, filename);

  try {
    await waitUntilStable(incomingPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return; // already handled elsewhere
    throw err;
  }

  const hash = await sha256File(incomingPath);
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

  const storagePath = await moveIntoStorage(incomingPath, hash, ext);
  const { size } = await stat(storagePath);
  const ingestedAt = new Date().toISOString();
  const ctx: FileContext = {
    hash,
    storagePath,
    originalFilename: filename,
    sizeBytes: size,
    contentType: guessContentType(storagePath),
  };

  const applicable = pluginRegistry.filter((plugin) => plugin.appliesTo(ctx));
  await applyPlugins(ctx, applicable, ingestedAt);

  logger.success(`Ingested ${filename} -> ${storagePath} (${hash.slice(0, 12)}...)`);
}
