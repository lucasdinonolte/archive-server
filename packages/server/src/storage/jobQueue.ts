import Database from "better-sqlite3";

export type JobStatus = "pending" | "running" | "done" | "failed";

export type Job = {
  id: number;
  fileHash: string;
  pluginId: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
};

type JobRow = {
  id: number;
  file_hash: string;
  plugin_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
};

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    fileHash: row.file_hash,
    pluginId: row.plugin_id,
    status: row.status as JobStatus,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    claimedAt: row.claimed_at,
  };
}

export type JobStats = {
  pending: number;
  running: number;
  done: number;
  failed: number;
};

export class JobQueue {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_hash TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        claimed_at TEXT,
        UNIQUE(file_hash, plugin_id)
      )
    `);
  }

  enqueue(fileHash: string, pluginId: string): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO jobs (file_hash, plugin_id) VALUES (?, ?)`
    ).run(fileHash, pluginId);
  }

  enqueueMany(entries: Array<{ fileHash: string; pluginId: string }>): void {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO jobs (file_hash, plugin_id) VALUES (?, ?)`
    );
    const txn = this.db.transaction(() => {
      for (const { fileHash, pluginId } of entries) {
        insert.run(fileHash, pluginId);
      }
    });
    txn();
  }

  claim(): Job | undefined {
    const row = this.db.prepare(`
      UPDATE jobs
      SET status = 'running',
          attempts = attempts + 1,
          claimed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      )
      RETURNING *
    `).get() as JobRow | undefined;

    return row ? toJob(row) : undefined;
  }

  complete(id: number): void {
    this.db.prepare(
      `UPDATE jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?`
    ).run(id);
  }

  fail(id: number, error: string): void {
    this.db.prepare(`
      UPDATE jobs
      SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
          last_error = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(error, id);
  }

  resetStale(minutes = 10): number {
    const result = this.db.prepare(`
      UPDATE jobs
      SET status = 'pending',
          updated_at = datetime('now')
      WHERE status = 'running'
        AND claimed_at < datetime('now', '-' || ? || ' minutes')
    `).run(minutes);
    return result.changes;
  }

  stats(): JobStats {
    const rows = this.db.prepare(
      `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
    ).all() as Array<{ status: string; count: number }>;

    const result: JobStats = { pending: 0, running: 0, done: 0, failed: 0 };
    for (const row of rows) {
      if (row.status in result) {
        result[row.status as keyof JobStats] = row.count;
      }
    }
    return result;
  }

  fileJobs(fileHash: string): { processing: boolean; pendingJobs: number } {
    const rows = this.db.prepare(
      `SELECT status FROM jobs WHERE file_hash = ? AND status IN ('pending', 'running')`
    ).all(fileHash) as Array<{ status: string }>;

    return {
      processing: rows.some((r) => r.status === "running"),
      pendingJobs: rows.length,
    };
  }

  hasPending(): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM jobs WHERE status = 'pending' LIMIT 1`
    ).get();
    return row !== undefined;
  }

  close(): void {
    this.db.close();
  }
}
