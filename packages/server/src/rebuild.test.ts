import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { config } from '@/config';
import { applyPlugins } from '@/applyPlugins';
import { pluginRegistry } from '@/plugins/registry';
import type { Plugin, PluginSchema } from '@/plugins/types';
import { rebuildDb } from '@/rebuild';
import {
  createDatabaseConnection,
  ensurePluginTable,
  findFileByHash,
  getPluginRow,
} from '@/storage/db';

// A self-contained fake plugin: its analyze() ignores the file and returns a
// counter plus a fixed BLOB, so the test needs no real assets and no CLIP model.
let counter = 0;
const fakeSchema: PluginSchema = {
  table: 'fake',
  columns: [
    { name: 'value', type: 'INTEGER' },
    { name: 'blob', type: 'BLOB' },
  ],
};
const fakePlugin: Plugin = {
  id: 'fake',
  version: 1,
  appliesTo: () => true,
  schema: fakeSchema,
  analyze: async () => ({ value: ++counter, blob: Buffer.from([1, 2, 3, 4]) }),
};

let tmp: string;
let originalStorageDir: string;
let originalDbPath: string;
let originalRegistry: Plugin[];

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'rebuild-test-'));
  originalStorageDir = config.storageDir;
  originalDbPath = config.dbPath;
  config.storageDir = path.join(tmp, 'storage');
  config.dbPath = path.join(tmp, 'archive.db');

  originalRegistry = [...pluginRegistry];
  pluginRegistry.length = 0;
  pluginRegistry.push(fakePlugin);

  await createDatabaseConnection();
  ensurePluginTable(fakeSchema);
});

afterAll(async () => {
  config.storageDir = originalStorageDir;
  config.dbPath = originalDbPath;
  pluginRegistry.length = 0;
  pluginRegistry.push(...originalRegistry);
  await rm(tmp, { recursive: true, force: true });
});

it('rebuilds the database from sidecars, with BLOBs byte-identical', async () => {
  // This is the whole "the DB is a disposable index" claim, end to end: write a
  // file's data, wipe and rebuild the DB purely from its sidecar, and get the
  // exact same rows back — embedding bytes included.
  const hash = 'a'.repeat(64);
  const ctx = {
    hash,
    storagePath: path.join(config.storageDir, 'file.bin'),
    originalFilename: 'file.bin',
    sizeBytes: 4,
    contentType: 'application/octet-stream',
  };

  await applyPlugins(ctx, pluginRegistry, '2026-07-14T00:00:00.000Z');

  const before = getPluginRow('fake', hash);
  expect(before).toBeDefined();

  await rebuildDb();

  const file = findFileByHash(hash);
  expect(file?.originalFilename).toBe('file.bin');

  const after = getPluginRow('fake', hash);
  expect(after?.value).toBe(before?.value);

  const blob = after?.blob;
  expect(Buffer.isBuffer(blob) && blob.equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
});
