import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { config } from '@/config';
import { setAuthoredMetadata } from '@/authored';
import { pluginRegistry } from '@/plugins/registry';
import type { Plugin } from '@/plugins/types';
import { rebuildDb } from '@/rebuild';
import { writeSidecar } from '@/storage/cas';
import { createDatabaseConnection, getAuthoredRow, upsertFileRecord } from '@/storage/db';

const hash = 'b'.repeat(64);
let tmp: string;
let originalStorageDir: string;
let originalDbPath: string;
let originalRegistry: Plugin[];

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'authored-test-'));
  originalStorageDir = config.storageDir;
  originalDbPath = config.dbPath;
  config.storageDir = path.join(tmp, 'storage');
  config.dbPath = path.join(tmp, 'archive.db');

  originalRegistry = [...pluginRegistry];
  pluginRegistry.length = 0; // no plugins needed to test authored survival

  await createDatabaseConnection();
  upsertFileRecord({ hash, storagePath: 'x.bin', originalFilename: 'x.bin', ingestedAt: '2026-07-14T00:00:00.000Z' });

  // rebuildDb discovers files by scanning for data sidecars; every real file has
  // one (ingest always runs core-metadata). Write a bare one so the hash is found.
  await writeSidecar({ hash, originalFilename: 'x.bin', ingestedAt: '2026-07-14T00:00:00.000Z', storagePath: 'x.bin', plugins: {} });
});

afterAll(async () => {
  config.storageDir = originalStorageDir;
  config.dbPath = originalDbPath;
  pluginRegistry.length = 0;
  pluginRegistry.push(...originalRegistry);
  await rm(tmp, { recursive: true, force: true });
});

it('merges partial patches, leaving untouched fields intact', async () => {
  await setAuthoredMetadata(hash, { project: 'atlas', tags: ['logo', 'wip'] });
  await setAuthoredMetadata(hash, { tags: ['logo'] }); // project omitted -> preserved

  const row = getAuthoredRow(hash);
  expect(row?.project).toBe('atlas');
  expect(row?.tags).toEqual(['logo']);
});

it('rejects an unknown hash so no orphan sidecar is stranded', async () => {
  await expect(setAuthoredMetadata('c'.repeat(64), { project: 'x' })).rejects.toThrow();
});

it('survives a full DB rebuild — the whole point of the separate sidecar', async () => {
  await setAuthoredMetadata(hash, { project: 'atlas', tags: ['logo'] });
  await rebuildDb(); // drops authored_metadata table, replays it from authored.json

  const row = getAuthoredRow(hash);
  expect(row?.project).toBe('atlas');
  expect(row?.tags).toEqual(['logo']);
});
