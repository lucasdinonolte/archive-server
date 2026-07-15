import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import Database from 'better-sqlite3';

import { config } from '@/config';
import type { PluginSchema, ColumnValue } from '@/plugins/types';

export type FileRecord = {
  hash: string;
  storagePath: string;
  originalFilename: string;
  ingestedAt: string;
}

const INITIAL_SCHEMA = `CREATE TABLE IF NOT EXISTS files (
  hash TEXT PRIMARY KEY,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  ingested_at TEXT NOT NULL
)`;

const AUTHORED_SCHEMA = `CREATE TABLE IF NOT EXISTS authored_metadata (
  file_hash TEXT PRIMARY KEY REFERENCES files(hash),
  project TEXT,
  tags TEXT,
  updated_at TEXT NOT NULL
)`;

type FileRow = { hash: string; storage_path: string; original_filename: string; ingested_at: string };

const FILE_COLS = "hash, storage_path, original_filename, ingested_at";

function toFileRecord(row: FileRow): FileRecord {
  return {
    hash: row.hash,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    ingestedAt: row.ingested_at,
  };
}

let db: Database.Database;

export async function createDatabaseConnection(): Promise<Database.Database> {
  await mkdir(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  //db.pragma('journal_mode = WAL');

  db.exec(INITIAL_SCHEMA);
  db.exec(AUTHORED_SCHEMA);

  return db;
};

export type AuthoredRecord = { project: string | null; tags: string[]; updatedAt: string };

export function getAuthoredRow(hash: string): AuthoredRecord | undefined {
  const row = db
    .prepare("SELECT project, tags, updated_at FROM authored_metadata WHERE file_hash = ?")
    .get(hash) as { project: string | null; tags: string | null; updated_at: string } | undefined;
  if (!row) return undefined;
  return { project: row.project, tags: row.tags ? JSON.parse(row.tags) : [], updatedAt: row.updated_at };
}

export function upsertAuthoredRow(hash: string, record: AuthoredRecord): void {
  db.prepare(
    `INSERT INTO authored_metadata (file_hash, project, tags, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(file_hash) DO UPDATE SET
       project = excluded.project,
       tags = excluded.tags,
       updated_at = excluded.updated_at`
  ).run(hash, record.project, JSON.stringify(record.tags), record.updatedAt);
}

export function findFileByHash(hash: string): FileRecord | undefined {
  const row = db
    .prepare(`SELECT ${FILE_COLS} FROM files WHERE hash = ?`)
    .get(hash) as FileRow | undefined;

  return row ? toFileRecord(row) : undefined;
}

export function listFiles(limit: number, offset: number): FileRecord[] {
  const rows = db
    .prepare(`SELECT ${FILE_COLS} FROM files ORDER BY ingested_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as FileRow[];
  return rows.map(toFileRecord);
}

export function countFiles(): number {
  return (db.prepare("SELECT COUNT(*) as n FROM files").get() as { n: number }).n;
}

export function getStats(): { totalFiles: number; totalSizeBytes: number } {
  const row = db
    .prepare(
      `SELECT COUNT(f.hash) AS totalFiles, COALESCE(SUM(c.size_bytes), 0) AS totalSizeBytes
       FROM files f LEFT JOIN plugin_core_metadata c ON c.file_hash = f.hash`
    )
    .get() as { totalFiles: number; totalSizeBytes: number };
  return row;
}

export function getPluginRow(table: string, hash: string): Record<string, unknown> | undefined {
  const row = db.prepare(`SELECT * FROM plugin_${table} WHERE file_hash = ?`).get(hash) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const { file_hash, ...rest } = row;
  return rest;
}

export function insertFileRecord(record: FileRecord): void {
  db.prepare(
    "INSERT INTO files (hash, storage_path, original_filename, ingested_at) VALUES (?, ?, ?, ?)"
  ).run(record.hash, record.storagePath, record.originalFilename, record.ingestedAt);
}

/** Like {@link insertFileRecord} but idempotent — used on paths (ingest, backfill) that may run for a file that already has a row. */
export function upsertFileRecord(record: FileRecord): void {
  db.prepare(
    `INSERT INTO files (hash, storage_path, original_filename, ingested_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET
       storage_path = excluded.storage_path,
       original_filename = excluded.original_filename,
       ingested_at = excluded.ingested_at`
  ).run(record.hash, record.storagePath, record.originalFilename, record.ingestedAt);
}

function pluginTableName(schema: PluginSchema): string {
  return `plugin_${schema.table}`;
}

export function ensurePluginTable(schema: PluginSchema): void {
  const tableName = pluginTableName(schema);
  const columnDefs = schema.columns
    .map((c) => `${c.name} ${c.type}${c.nullable === false ? " NOT NULL" : ""}`)
    .join(",\n      ");

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      file_hash TEXT PRIMARY KEY REFERENCES files(hash),
      ${columnDefs}
    )
  `);

  const existingCols = new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).map((r) => r.name)
  );
  for (const col of schema.columns) {
    if (!existingCols.has(col.name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`);
    }
  }
}

/**
 * Drops every derived table and recreates the current schema, ready to be
 * repopulated from sidecars. Drops all `plugin_*` tables found (not just the
 * currently-registered ones) so tables from removed plugins don't linger.
 */
export function rebuildSchema(schemas: PluginSchema[]): void {
  const pluginTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'plugin_%'")
    .all() as { name: string }[];

  // Drop child tables before files: they reference files(hash), so the parent
  // can't be dropped while a child still exists. authored_metadata is derived
  // from its sidecar (not a plugin table), so it drops and rebuilds here too.
  for (const { name } of pluginTables) db.exec(`DROP TABLE IF EXISTS ${name}`);
  db.exec("DROP TABLE IF EXISTS authored_metadata");
  db.exec("DROP TABLE IF EXISTS files");

  db.exec(INITIAL_SCHEMA);
  db.exec(AUTHORED_SCHEMA);
  for (const schema of schemas) ensurePluginTable(schema);
}

export function upsertPluginRow(schema: PluginSchema, hash: string, values: Record<string, ColumnValue>): void {
  const tableName = pluginTableName(schema);
  const names = schema.columns.map((c) => c.name);
  const placeholders = names.map(() => "?").join(", ");
  const updates = names.map((n) => `${n} = excluded.${n}`).join(", ");

  db.prepare(
    `INSERT INTO ${tableName} (file_hash, ${names.join(", ")})
     VALUES (?, ${placeholders})
     ON CONFLICT(file_hash) DO UPDATE SET ${updates}`
  ).run(hash, ...names.map((n) => values[n] ?? null));
}
