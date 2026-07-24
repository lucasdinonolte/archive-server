import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { config, createStorage } from '@/config';
import { createDatabaseConnection, ensurePluginTable } from '@/storage/db';
import type { BlobStorage } from '@/storage/blobStorage';
import { JobQueue } from '@/storage/jobQueue';
import { TaskQueue } from '@/queue';
import { reconcile, startPeriodicReconcile } from "@/reconcile";
import { startWatcher } from "@/watcher";
import { loadAsyncPlugins, pluginRegistry } from "@/plugins/registry";
import { startApiServer } from "@/api/server";
import { backfill } from "@/backfill";
import { rebuildDb } from "@/rebuild";
import { BackgroundWorker } from "@/worker";
import { logger } from "@/utils/logger";

/** Opens the database and loads every plugin so their tables exist. Shared by all commands. */
async function bootstrap(): Promise<{ storage: BlobStorage; jobQueue: JobQueue }> {
  sharp.cache(false);
  sharp.concurrency(1);

  await createDatabaseConnection();
  await loadAsyncPlugins();
  for (const plugin of pluginRegistry) {
    if (plugin.schema) ensurePluginTable(plugin.schema);
  }

  const storage = createStorage();
  const jobQueue = new JobQueue(path.join(path.dirname(config.dbPath), "jobs.db"));

  return { storage, jobQueue };
}

/** Default command: watch the incoming dir and serve the API. Never resolves. */
export async function watch(): Promise<void> {
  await mkdir(config.incomingDir, { recursive: true });
  const { storage, jobQueue } = await bootstrap();

  const queue = new TaskQueue(config.concurrency);
  const worker = new BackgroundWorker(storage, jobQueue);
  worker.start();

  await reconcile(queue, storage, jobQueue);
  startWatcher(queue, storage, jobQueue);
  const reconcileTimer = startPeriodicReconcile(queue, storage, jobQueue);

  const apiServer = await startApiServer(storage, jobQueue);

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    worker.stop();
    clearInterval(reconcileTimer);
    apiServer?.close();
    jobQueue.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export async function runBackfill(): Promise<void> {
  const { storage, jobQueue } = await bootstrap();
  await backfill(storage, jobQueue);

  const worker = new BackgroundWorker(storage, jobQueue, { pollIntervalMs: 1000 });
  worker.start();
  await worker.onDrain();
  worker.stop();
  jobQueue.close();
}

export async function runRebuild(): Promise<void> {
  const { storage, jobQueue } = await bootstrap();
  await rebuildDb(storage);
  jobQueue.close();
}
