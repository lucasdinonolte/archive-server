import { mkdir } from 'node:fs/promises';

import { config } from '@/config';
import { createDatabaseConnection, ensurePluginTable } from '@/storage/db';
import { TaskQueue } from '@/queue';
import { reconcile, startPeriodicReconcile } from "@/reconcile";
import { startWatcher } from "@/watcher";
import { loadAsyncPlugins, pluginRegistry } from "@/plugins/registry";
import { startApiServer } from "@/api/server";
import { backfill } from "@/backfill";
import { rebuildDb } from "@/rebuild";
import { logger } from "@/utils/logger";

/** Opens the database and loads every plugin so their tables exist. Shared by all commands. */
async function bootstrap(): Promise<void> {
  await createDatabaseConnection();
  await loadAsyncPlugins();
  for (const plugin of pluginRegistry) {
    if (plugin.schema) ensurePluginTable(plugin.schema);
  }
}

/** Default command: watch the incoming dir and serve the API. Never resolves. */
async function watch(): Promise<void> {
  await mkdir(config.incomingDir, { recursive: true });
  await bootstrap();

  const queue = new TaskQueue(config.concurrency);

  await reconcile(queue);
  startWatcher(queue);
  const reconcileTimer = startPeriodicReconcile(queue);

  const apiServer = await startApiServer();

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    clearInterval(reconcileTimer);
    apiServer?.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function runBackfill(): Promise<void> {
  await bootstrap();
  const queue = new TaskQueue(config.concurrency);
  await backfill(queue);
  await queue.onIdle();
}

async function runRebuild(): Promise<void> {
  await bootstrap();
  await rebuildDb();
}

const commands: Record<string, () => Promise<void>> = {
  watch,
  backfill: runBackfill,
  rebuild: runRebuild,
};

const command = process.argv[2] ?? "watch";
const run = commands[command];

if (!run) {
  logger.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

run()
  .then(() => {
    if (command !== "watch") process.exit(0);
  })
  .catch((err) => {
    logger.error(`Command "${command}" failed:`, err);
    process.exit(1);
  });
