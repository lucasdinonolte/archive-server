import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { config } from '@/config';
import { setAuthoredMetadata } from '@/authored';
import { pluginRegistry } from '@/plugins/registry';
import type { Plugin } from '@/plugins/types';
import { rebuildDb } from '@/rebuild';
import { LocalBlobStorage } from '@/storage/localBlobStorage';
import type { BlobStorage } from '@/storage/blobStorage';
import { createDatabaseConnection, findFileByHash, getFileTags, upsertFileRecord } from '@/storage/db';

const hash = 'b'.repeat(64);
let tmp: string;
let originalStorageDir: string;
let originalDbPath: string;
let originalRegistry: Plugin[];
let storage: BlobStorage;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'authored-test-'));
  originalStorageDir = config.storageDir;
  originalDbPath = config.dbPath;
  config.storageDir = path.join(tmp, 'storage');
  config.dbPath = path.join(tmp, 'archive.db');

  storage = new LocalBlobStorage(config.storageDir);

  originalRegistry = [...pluginRegistry];
  pluginRegistry.length = 0;

  await createDatabaseConnection();
  upsertFileRecord({ hash, storagePath: 'x.bin', originalFilename: 'x.bin', ingestedAt: '2026-07-14T00:00:00.000Z' });

  await storage.writeSidecar({ hash, originalFilename: 'x.bin', ingestedAt: '2026-07-14T00:00:00.000Z', storagePath: 'x.bin', plugins: {} });
});

afterAll(async () => {
  config.storageDir = originalStorageDir;
  config.dbPath = originalDbPath;
  pluginRegistry.length = 0;
  pluginRegistry.push(...originalRegistry);
  await rm(tmp, { recursive: true, force: true });
});

it('merges partial patches, leaving untouched fields intact', async () => {
  await setAuthoredMetadata(hash, { project: 'atlas', tags: ['logo', 'wip'] }, storage);
  await setAuthoredMetadata(hash, { tags: ['logo'] }, storage);

  const file = findFileByHash(hash);
  expect(file?.project).toBe('atlas');
  expect(getFileTags(hash)).toEqual(['logo']);
});

it('rejects an unknown hash so no orphan sidecar is stranded', async () => {
  await expect(setAuthoredMetadata('c'.repeat(64), { project: 'x' }, storage)).rejects.toThrow();
});

it('survives a full DB rebuild — the whole point of the separate sidecar', async () => {
  await setAuthoredMetadata(hash, { project: 'atlas', tags: ['logo'] }, storage);
  await rebuildDb(storage);

  const file = findFileByHash(hash);
  expect(file?.project).toBe('atlas');
  expect(getFileTags(hash)).toEqual(['logo']);
});
