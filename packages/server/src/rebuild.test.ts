import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { config } from '@/config';
import { applyPlugins } from '@/applyPlugins';
import { pluginRegistry } from '@/plugins/registry';
import type { Plugin, PluginSchema } from '@/plugins/types';
import { rebuildDb } from '@/rebuild';
import { LocalBlobStorage } from '@/storage/localBlobStorage';
import type { BlobStorage } from '@/storage/blobStorage';
import {
  createDatabaseConnection,
  ensurePluginTable,
  findFileByHash,
  getPluginRow,
} from '@/storage/db';

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
let storage: BlobStorage;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'rebuild-test-'));
  originalStorageDir = config.storageDir;
  originalDbPath = config.dbPath;
  config.storageDir = path.join(tmp, 'storage');
  config.dbPath = path.join(tmp, 'archive.db');

  storage = new LocalBlobStorage(config.storageDir);

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
  const hash = 'a'.repeat(64);
  const ctx = {
    hash,
    ext: '.bin',
    storagePath: path.join(config.storageDir, 'file.bin'),
    originalFilename: 'file.bin',
    sizeBytes: 4,
    contentType: 'application/octet-stream',
    mtimeMs: Date.now(),
  };

  await applyPlugins(ctx, pluginRegistry, '2026-07-14T00:00:00.000Z', storage);

  const before = getPluginRow('fake', hash);
  expect(before).toBeDefined();

  await rebuildDb(storage);

  const file = findFileByHash(hash);
  expect(file?.originalFilename).toBe('file.bin');

  const after = getPluginRow('fake', hash);
  expect(after?.value).toBe(before?.value);

  const blob = after?.blob;
  expect(Buffer.isBuffer(blob) && blob.equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
});
