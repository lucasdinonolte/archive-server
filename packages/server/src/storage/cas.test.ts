import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { config } from '@/config';
import type { ColumnDefinition } from '@/plugins/types';
import { encodePluginResult, fromJsonSafe, readSidecar, sidecarPathForHash, writeSidecar } from '@/storage/cas';

// Redirect the content-addressed store to a throwaway dir for the duration of
// the suite. cas.ts reads config.storageDir at call time, so mutating it here
// is enough of a seam — no need to thread the path through every function.
let originalStorageDir: string;
let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'cas-test-'));
  originalStorageDir = config.storageDir;
  config.storageDir = tmp;
});

afterAll(async () => {
  config.storageDir = originalStorageDir;
  await rm(tmp, { recursive: true, force: true });
});

describe('sidecar round-trip', () => {
  it('recovers every column type, byte-identically for BLOBs', async () => {
    // The whole "DB is rebuildable from sidecars" claim rests on this: a value
    // written to a sidecar must come back unchanged. BLOBs are the fragile case
    // — before fromJsonSafe existed, a rebuild would have re-inserted the raw
    // base64 string into a BLOB column, silently corrupting the embedding.
    const columns: ColumnDefinition[] = [
      { name: 'label', type: 'TEXT' },
      { name: 'count', type: 'INTEGER' },
      { name: 'score', type: 'REAL' },
      { name: 'embedding', type: 'BLOB' },
      { name: 'missing', type: 'TEXT' },
    ];
    const embedding = Buffer.from(Float32Array.from([0.5, -1.25, 3]).buffer);
    const hash = 'a'.repeat(64);

    await writeSidecar({
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

    const sidecar = await readSidecar(hash);
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
    // Files archived before step 2 have no provenance. Reading one must not
    // throw and must mark its plugins stale (version 0) so backfill re-runs them.
    const hash = 'b'.repeat(64);
    const legacy = {
      hash,
      originalFilename: 'old.png',
      ingestedAt: '2025-01-01T00:00:00.000Z',
      storagePath: '/dev/null',
      plugins: { 'core-metadata': { size_bytes: 10, content_type: 'image/png' } },
    };
    const filePath = sidecarPathForHash(hash);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(legacy));

    const sidecar = await readSidecar(hash);
    if (!sidecar) throw new Error('expected sidecar');
    expect(sidecar.formatVersion).toBe(1);

    const entry = sidecar.plugins['core-metadata'];
    if (!entry) throw new Error('expected core-metadata entry');
    expect(entry.version).toBe(0);
    expect(entry.computedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(entry.data.size_bytes).toBe(10);
  });

  it('returns undefined for a hash with no sidecar', async () => {
    expect(await readSidecar('f'.repeat(64))).toBeUndefined();
  });
});
