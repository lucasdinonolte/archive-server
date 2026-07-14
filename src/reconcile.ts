import { readdir } from "node:fs/promises";
import { config } from "@/config";
import { TaskQueue } from "@/queue";
import { ingestFile } from "@/ingest";

import { logger } from "@/utils/logger";

export async function reconcile(queue: TaskQueue): Promise<void> {
  const entries = await readdir(config.incomingDir);
  if (entries.length > 0) {
    logger.info(`Reconcile: found ${entries.length} file(s) waiting in incoming/`);
  }
  for (const filename of entries) {
    queue.push(() => ingestFile(filename));
  }
}

export function startPeriodicReconcile(queue: TaskQueue): NodeJS.Timeout {
  return setInterval(() => {
    reconcile(queue).catch((err) => logger.error("Reconcile failed:", err));
  }, config.reconcileIntervalMs);
}
