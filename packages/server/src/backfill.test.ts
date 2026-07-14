import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { config } from '@/config';
import { applyPlugins } from '@/applyPlugins';
import { backfill } from '@/backfill';
import { pluginRegistry } from '@/plugins/registry';
import type { Plugin, PluginSchema } from '@/plugins/types';
import { TaskQueue } from '@/queue';
import { readSidecar } from '@/storage/cas';
import { createDatabaseConnection, ensurePluginTable } from '@/storage/db';

let counter = 0;
const fakeSchema: PluginSchema = {
  table: 'fake',
  columns: [{ name: 'value', type: 'INTEGER' }],
};
const fakePlugin: Plugin = {
  id: 'fake',
  version: 1,
  appliesTo: () => true,
  schema: fakeSchema,
  analyze: async () => ({ value: ++counter }),
};

let tmp: string;
let originalStorageDir: string;
let originalDbPath: string;
let originalRegistry: Plugin[];

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'backfill-test-'));
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

it('re-runs stale plugins and leaves up-to-date files untouched', async () => {
  const hash = 'b'.repeat(64);
  const storagePath = path.join(config.storageDir, 'photo.bin');
  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, Buffer.from([0, 1, 2, 3]));
  const ctx = {
    hash,
    storagePath,
    originalFilename: 'photo.bin',
    sizeBytes: 4,
    contentType: 'application/octet-stream',
  };

  // Simulate the original ingest at version 1.
  await applyPlugins(ctx, pluginRegistry, '2026-07-14T00:00:00.000Z');
  const first = await readSidecar(hash);
  expect(first?.plugins.fake?.version).toBe(1);
  const firstValue = first?.plugins.fake?.data.value;

  // A newer plugin version makes the stored result stale → backfill re-runs it.
  fakePlugin.version = 2;
  await runBackfill();

  const bumped = await readSidecar(hash);
  expect(bumped?.plugins.fake?.version).toBe(2);
  expect(bumped?.plugins.fake?.data.value).not.toBe(firstValue);
  const bumpedValue = bumped?.plugins.fake?.data.value;

  // Nothing is stale now → a second backfill must not re-run the plugin.
  await runBackfill();
  const unchanged = await readSidecar(hash);
  expect(unchanged?.plugins.fake?.data.value).toBe(bumpedValue);
});

async function runBackfill(): Promise<void> {
  const queue = new TaskQueue(2);
  await backfill(queue);
  await queue.onIdle();
}
