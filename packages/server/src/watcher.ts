import { watch } from "node:fs";
import { config } from "@/config";
import { TaskQueue } from "@/queue";
import type { BlobStorage } from "@/storage/blobStorage";
import type { JobQueue } from "@/storage/jobQueue";
import { ingestFile } from "@/ingest";
import { logger } from "@/utils/logger";

const debounceTimers = new Map<string, NodeJS.Timeout>();

export function startWatcher(queue: TaskQueue, storage: BlobStorage, jobQueue: JobQueue): void {
  watch(config.incomingDir, (_eventType, filename) => {
    if (!filename) return;
    scheduleProcessing(filename, queue, storage, jobQueue);
  });
  logger.info(`Watching ${config.incomingDir}`);
}

function scheduleProcessing(filename: string, queue: TaskQueue, storage: BlobStorage, jobQueue: JobQueue): void {
  const existing = debounceTimers.get(filename);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    debounceTimers.delete(filename);
    queue.push(() => ingestFile(filename, storage, jobQueue));
  }, config.debounceMs);

  debounceTimers.set(filename, timer);
}
