import { stat } from "node:fs/promises";

import { applyPlugins } from "@/applyPlugins";
import { guessContentType } from "@/mime";
import { pluginRegistry } from "@/plugins/registry";
import type { FileContext } from "@/plugins/types";
import type { BlobStorage } from "@/storage/blobStorage";
import { JobQueue } from "@/storage/jobQueue";
import { logger } from "@/utils/logger";

export type WorkerOptions = {
  pollIntervalMs?: number;
  concurrency?: number;
};

export class BackgroundWorker {
  private storage: BlobStorage;
  private jobQueue: JobQueue;
  private pollIntervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = 0;
  private concurrency: number;
  private stopped = false;
  private drainResolvers: Array<() => void> = [];

  constructor(storage: BlobStorage, jobQueue: JobQueue, opts: WorkerOptions = {}) {
    this.storage = storage;
    this.jobQueue = jobQueue;
    this.pollIntervalMs = opts.pollIntervalMs ?? 5000;
    this.concurrency = opts.concurrency ?? 1;
  }

  start(): void {
    this.stopped = false;
    const staleReset = this.jobQueue.resetStale();
    if (staleReset > 0) {
      logger.info(`Worker: reset ${staleReset} stale job(s)`);
    }
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    logger.info("Background worker started");
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    logger.info("Background worker stopped");
  }

  /** Resolves when there are no more pending/running jobs. */
  onDrain(): Promise<void> {
    if (this.running === 0 && !this.jobQueue.hasPending()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.drainResolvers.push(resolve));
  }

  private poll(): void {
    if (this.stopped) return;
    while (this.running < this.concurrency) {
      const job = this.jobQueue.claim();
      if (!job) break;
      this.running++;
      this.processJob(job.id, job.fileHash, job.pluginId)
        .catch(() => {})
        .finally(() => {
          this.running--;
          this.checkDrain();
          if (!this.stopped) this.poll();
        });
    }
  }

  private async processJob(jobId: number, fileHash: string, pluginId: string): Promise<void> {
    const plugin = pluginRegistry.find((p) => p.id === pluginId);
    if (!plugin) {
      this.jobQueue.fail(jobId, `Plugin "${pluginId}" not found in registry`);
      logger.warn(`Worker: plugin "${pluginId}" not found, failing job ${jobId}`);
      return;
    }

    const sidecar = await this.storage.readSidecar(fileHash);
    if (!sidecar) {
      this.jobQueue.fail(jobId, `No sidecar found for hash ${fileHash}`);
      logger.warn(`Worker: no sidecar for ${fileHash.slice(0, 12)}..., failing job ${jobId}`);
      return;
    }

    const fileStat = await stat(sidecar.storagePath).catch(() => undefined);
    if (!fileStat) {
      this.jobQueue.fail(jobId, `File not found at ${sidecar.storagePath}`);
      logger.warn(`Worker: file missing for ${fileHash.slice(0, 12)}..., failing job ${jobId}`);
      return;
    }

    const ext = sidecar.storagePath.match(/\.[^.]+$/)?.[0] ?? "";
    const ctx: FileContext = {
      hash: fileHash,
      ext,
      storagePath: sidecar.storagePath,
      originalFilename: sidecar.originalFilename,
      sizeBytes: fileStat.size,
      contentType: guessContentType(sidecar.storagePath),
      mtimeMs: fileStat.mtimeMs,
    };

    try {
      await applyPlugins(ctx, [plugin], sidecar.ingestedAt, this.storage);
      this.jobQueue.complete(jobId);
      logger.success(`Worker: completed ${pluginId} for ${fileHash.slice(0, 12)}...`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.jobQueue.fail(jobId, message);
      logger.error(`Worker: ${pluginId} failed for ${fileHash.slice(0, 12)}...: ${message}`);
    }
  }

  private checkDrain(): void {
    if (this.running === 0 && !this.jobQueue.hasPending()) {
      const resolvers = this.drainResolvers;
      this.drainResolvers = [];
      resolvers.forEach((r) => r());
    }
  }
}
