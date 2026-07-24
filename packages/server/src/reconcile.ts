import { readdir } from "node:fs/promises";
import { config } from "@/config";
import { TaskQueue } from "@/queue";
import type { BlobStorage } from "@/storage/blobStorage";
import type { JobQueue } from "@/storage/jobQueue";
import { ingestFile } from "@/ingest";

import { logger } from "@/utils/logger";

export async function reconcile(queue: TaskQueue, storage: BlobStorage, jobQueue: JobQueue): Promise<void> {
  const entries = await readdir(config.incomingDir);
  if (entries.length > 0) {
    logger.info(`Reconcile: found ${entries.length} file(s) waiting in incoming/`);
  }
  for (const filename of entries) {
    queue.push(() => ingestFile(filename, storage, jobQueue));
  }
}

export function startPeriodicReconcile(queue: TaskQueue, storage: BlobStorage, jobQueue: JobQueue): NodeJS.Timeout {
  return setInterval(() => {
    reconcile(queue, storage, jobQueue).catch((err) => logger.error("Reconcile failed:", err));
  }, config.reconcileIntervalMs);
}
