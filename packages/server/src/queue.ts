import { logger } from "@/utils/logger";

type Task = () => Promise<void>;

export class TaskQueue {
  private concurrency: number;
  private running = 0;
  private pending: Task[] = [];
  private idleResolvers: Array<() => void> = [];

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, concurrency);
  }

  push(task: Task): void {
    this.pending.push(task);
    this.drain();
  }

  /** Resolves once nothing is running or pending. Lets a one-shot run (e.g. backfill) wait for the queue to finish before exiting. */
  onIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  private isIdle(): boolean {
    return this.running === 0 && this.pending.length === 0;
  }

  private drain(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.running++;
      task().
        catch((err) => {
          logger.error('Task failed:', err);
        }).
        finally(() => {
          this.running--;
          this.drain();
        });
    }

    if (this.isIdle()) {
      const resolvers = this.idleResolvers;
      this.idleResolvers = [];
      resolvers.forEach((resolve) => resolve());
    }
  }
}
