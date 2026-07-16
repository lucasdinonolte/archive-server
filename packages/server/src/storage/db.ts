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
  // Projected from core-metadata
  contentType: string | null;
  sizeBytes: number | null;
  // Projected from image-metadata
  width: number | null;
  height: number | null;
  format: string | null;
  colorSpace: string | null;
  dpi: number | null;
  dominantColor: string | null;
  // Authored
  project: string | null;
  authoredUpdatedAt: string | null;
}

const INITIAL_SCHEMA = `CREATE TABLE IF NOT EXISTS files (
  hash TEXT PRIMARY KEY,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  format TEXT,
  color_space TEXT,
  dpi REAL,
  dominant_color TEXT,
  project TEXT,
  authored_updated_at TEXT
)`;

const TAGS_SCHEMA = `CREATE TABLE IF NOT EXISTS tags (
  file_hash TEXT NOT NULL REFERENCES files(hash),
  tag TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (file_hash, tag, source)
)`;

type FileRow = {
  hash: string;
  storage_path: string;
  original_filename: string;
  ingested_at: string;
  content_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  color_space: string | null;
  dpi: number | null;
  dominant_color: string | null;
  project: string | null;
  authored_updated_at: string | null;
};

const FILE_COLS = "hash, storage_path, original_filename, ingested_at, content_type, size_bytes, width, height, format, color_space, dpi, dominant_color, project, authored_updated_at";

function toFileRecord(row: FileRow): FileRecord {
  return {
    hash: row.hash,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    ingestedAt: row.ingested_at,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    format: row.format,
    colorSpace: row.color_space,
    dpi: row.dpi,
    dominantColor: row.dominant_color,
    project: row.project,
    authoredUpdatedAt: row.authored_updated_at,
  };
}

let db: Database.Database;

/** Columns that were added after the initial schema — ensured on startup. */
const PROJECTED_COLUMNS = [
  { name: 'content_type', type: 'TEXT' },
  { name: 'size_bytes', type: 'INTEGER' },
  { name: 'width', type: 'INTEGER' },
  { name: 'height', type: 'INTEGER' },
  { name: 'format', type: 'TEXT' },
  { name: 'color_space', type: 'TEXT' },
  { name: 'dpi', type: 'REAL' },
  { name: 'dominant_color', type: 'TEXT' },
  { name: 'project', type: 'TEXT' },
  { name: 'authored_updated_at', type: 'TEXT' },
] as const;

export async function createDatabaseConnection(): Promise<Database.Database> {
  await mkdir(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);

  db.exec(INITIAL_SCHEMA);
  db.exec(TAGS_SCHEMA);

  // Migrate existing databases: add projected columns if missing.
  const existingCols = new Set(
    (db.prepare("PRAGMA table_info(files)").all() as { name: string }[]).map((r) => r.name)
  );
  for (const col of PROJECTED_COLUMNS) {
    if (!existingCols.has(col.name)) {
      db.exec(`ALTER TABLE files ADD COLUMN ${col.name} ${col.type}`);
    }
  }

  return db;
};

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
      `SELECT COUNT(hash) AS totalFiles, COALESCE(SUM(size_bytes), 0) AS totalSizeBytes FROM files`
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

export function insertFileRecord(record: Pick<FileRecord, 'hash' | 'storagePath' | 'originalFilename' | 'ingestedAt'>): void {
  db.prepare(
    "INSERT INTO files (hash, storage_path, original_filename, ingested_at) VALUES (?, ?, ?, ?)"
  ).run(record.hash, record.storagePath, record.originalFilename, record.ingestedAt);
}

/** Like {@link insertFileRecord} but idempotent — used on paths (ingest, backfill) that may run for a file that already has a row. */
export function upsertFileRecord(record: Pick<FileRecord, 'hash' | 'storagePath' | 'originalFilename' | 'ingestedAt'>): void {
  db.prepare(
    `INSERT INTO files (hash, storage_path, original_filename, ingested_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET
       storage_path = excluded.storage_path,
       original_filename = excluded.original_filename,
       ingested_at = excluded.ingested_at`
  ).run(record.hash, record.storagePath, record.originalFilename, record.ingestedAt);
}

/** Partial update of projected columns on the files row. Uses COALESCE so a partial backfill doesn't null out fields set by other plugins. */
export function updateProjectedFields(hash: string, fields: Partial<{
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  format: string;
  colorSpace: string;
  dpi: number;
  dominantColor: string;
}>): void {
  db.prepare(
    `UPDATE files SET
       content_type = COALESCE(?, content_type),
       size_bytes = COALESCE(?, size_bytes),
       width = COALESCE(?, width),
       height = COALESCE(?, height),
       format = COALESCE(?, format),
       color_space = COALESCE(?, color_space),
       dpi = COALESCE(?, dpi),
       dominant_color = COALESCE(?, dominant_color)
     WHERE hash = ?`
  ).run(
    fields.contentType ?? null,
    fields.sizeBytes ?? null,
    fields.width ?? null,
    fields.height ?? null,
    fields.format ?? null,
    fields.colorSpace ?? null,
    fields.dpi ?? null,
    fields.dominantColor ?? null,
    hash,
  );
}

/** Updates the authored project + timestamp on the files row. */
export function updateAuthoredFields(hash: string, project: string | null, updatedAt: string): void {
  db.prepare(
    `UPDATE files SET project = ?, authored_updated_at = ? WHERE hash = ?`
  ).run(project, updatedAt, hash);
}

/**
 * Replaces all tags for a (hash, source) pair. Deletes existing tags for that
 * source, then batch-inserts the new ones inside a transaction.
 */
export function replaceTags(hash: string, source: string, tags: string[]): void {
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM tags WHERE file_hash = ? AND source = ?").run(hash, source);
    const insert = db.prepare("INSERT INTO tags (file_hash, tag, source) VALUES (?, ?, ?)");
    for (const tag of tags) {
      insert.run(hash, tag, source);
    }
  });
  txn();
}

/** Returns all distinct tags for a file, regardless of source. */
export function getFileTags(hash: string): string[] {
  const rows = db
    .prepare("SELECT DISTINCT tag FROM tags WHERE file_hash = ?")
    .all(hash) as { tag: string }[];
  return rows.map((r) => r.tag);
}

/** Returns every distinct tag across all files, sorted alphabetically. */
export function getAllTags(): string[] {
  const rows = db
    .prepare("SELECT DISTINCT tag FROM tags ORDER BY tag")
    .all() as { tag: string }[];
  return rows.map((r) => r.tag);
}

/** Returns every distinct non-null project across all files, sorted alphabetically. */
export function getAllProjects(): string[] {
  const rows = db
    .prepare("SELECT DISTINCT project FROM files WHERE project IS NOT NULL ORDER BY project")
    .all() as { project: string }[];
  return rows.map((r) => r.project);
}

export type FileFilter = {
  tags?: string[];
  projects?: string[];
};

/**
 * Lists files with optional tag/project filtering. Tags are OR'd, projects are
 * OR'd, and the two groups are AND'd together.
 */
export function listFilesFiltered(limit: number, offset: number, filter: FileFilter): FileRecord[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.projects?.length) {
    conditions.push(`f.project IN (${filter.projects.map(() => '?').join(', ')})`);
    params.push(...filter.projects);
  }

  if (filter.tags?.length) {
    conditions.push(
      `f.hash IN (SELECT file_hash FROM tags WHERE tag IN (${filter.tags.map(() => '?').join(', ')}))`
    );
    params.push(...filter.tags);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT f.* FROM files f ${where} ORDER BY f.ingested_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as FileRow[];
  return rows.map(toFileRecord);
}

/** Counts files matching the given filter. */
export function countFilesFiltered(filter: FileFilter): number {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.projects?.length) {
    conditions.push(`f.project IN (${filter.projects.map(() => '?').join(', ')})`);
    params.push(...filter.projects);
  }

  if (filter.tags?.length) {
    conditions.push(
      `f.hash IN (SELECT file_hash FROM tags WHERE tag IN (${filter.tags.map(() => '?').join(', ')}))`
    );
    params.push(...filter.tags);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return (db.prepare(`SELECT COUNT(*) as n FROM files f ${where}`).get(...params) as { n: number }).n;
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

  for (const { name } of pluginTables) db.exec(`DROP TABLE IF EXISTS ${name}`);
  db.exec("DROP TABLE IF EXISTS tags");
  db.exec("DROP TABLE IF EXISTS authored_metadata");
  db.exec("DROP TABLE IF EXISTS files");

  db.exec(INITIAL_SCHEMA);
  db.exec(TAGS_SCHEMA);
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
