import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ColumnDefinition } from '@/plugins/types';
import { encodePluginResult, fromJsonSafe } from '@/storage/cas';
import { LocalBlobStorage } from '@/storage/localBlobStorage';

let tmp: string;
let storage: LocalBlobStorage;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'cas-test-'));
  storage = new LocalBlobStorage(tmp);
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('sidecar round-trip', () => {
  it('recovers every column type, byte-identically for BLOBs', async () => {
    const columns: ColumnDefinition[] = [
      { name: 'label', type: 'TEXT' },
      { name: 'count', type: 'INTEGER' },
      { name: 'score', type: 'REAL' },
      { name: 'embedding', type: 'BLOB' },
      { name: 'missing', type: 'TEXT' },
    ];
    const embedding = Buffer.from(Float32Array.from([0.5, -1.25, 3]).buffer);
    const hash = 'a'.repeat(64);

    await storage.writeSidecar({
      hash,
      originalFilename: 'photo.png',
      ingestedAt: '2026-07-14T00:00:00.000Z',
      storagePath: '/dev/null',
      plugins: {
        demo: encodePluginResult({
          version: 2,
          computedAt: '2026-07-14T00:00:00.000Z',
          data: { label: 'poster', count: 3, score: 0.75, embedding, missing: null },
        }),
      },
    });

    const sidecar = await storage.readSidecar(hash);
    if (!sidecar) throw new Error('expected sidecar to be written');
    expect(sidecar.formatVersion).toBe(2);

    const entry = sidecar.plugins.demo;
    if (!entry) throw new Error('expected plugin data in sidecar');
    expect(entry.version).toBe(2);
    expect(entry.computedAt).toBe('2026-07-14T00:00:00.000Z');

    const decoded = Object.fromEntries(
      columns.map((c) => [c.name, fromJsonSafe(entry.data[c.name] ?? null, c.type)]),
    );

    expect(decoded.label).toBe('poster');
    expect(decoded.count).toBe(3);
    expect(decoded.score).toBe(0.75);
    expect(decoded.missing).toBeNull();

    const recovered = decoded.embedding;
    expect(Buffer.isBuffer(recovered) && recovered.equals(embedding)).toBe(true);
  });

  it('normalizes a legacy v1 sidecar to a version-0 envelope', async () => {
    const hash = 'b'.repeat(64);
    const legacy = {
      hash,
      originalFilename: 'old.png',
      ingestedAt: '2025-01-01T00:00:00.000Z',
      storagePath: '/dev/null',
      plugins: { 'core-metadata': { size_bytes: 10, content_type: 'image/png' } },
    };
    const sidecarDir = path.join(tmp, hash.slice(0, 2), hash.slice(2, 4));
    await mkdir(sidecarDir, { recursive: true });
    await writeFile(path.join(sidecarDir, `${hash}.data.json`), JSON.stringify(legacy));

    const sidecar = await storage.readSidecar(hash);
    if (!sidecar) throw new Error('expected sidecar');
    expect(sidecar.formatVersion).toBe(1);

    const entry = sidecar.plugins['core-metadata'];
    if (!entry) throw new Error('expected core-metadata entry');
    expect(entry.version).toBe(0);
    expect(entry.computedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(entry.data.size_bytes).toBe(10);
  });

  it('returns undefined for a hash with no sidecar', async () => {
    expect(await storage.readSidecar('f'.repeat(64))).toBeUndefined();
  });
});
