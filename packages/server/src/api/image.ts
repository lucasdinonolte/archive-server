import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Hono } from 'hono';
import sharp from 'sharp';

import { config } from '@/config';
import { findFileByHash, getPluginRow } from '@/storage/db';

export const image = new Hono();

const CACHE_DIR = () => path.join(config.storageDir, '.cache', 'thumbnails');
const MIN_DIM = 50;
const MAX_DIM = 2000;
// A full decode holds width*height*channels bytes in memory; a burst of requests
// for large sources will OOM a 2GB box. Cap concurrent decodes and reject sources
// bigger than we'd ever thumbnail.
const MAX_INPUT_PIXELS = 50_000_000; // ~50MP
const MAX_CONCURRENT_RESIZES = 2;

// ponytail: process-global semaphore, fine for one server process; needs a shared
// limiter if this ever runs multi-process behind a load balancer.
let activeResizes = 0;
const resizeWaiters: Array<() => void> = [];
async function acquireResizeSlot(): Promise<() => void> {
  if (activeResizes >= MAX_CONCURRENT_RESIZES) {
    await new Promise<void>((resolve) => resizeWaiters.push(resolve));
  }
  activeResizes++;
  return () => {
    activeResizes--;
    resizeWaiters.shift()?.();
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cachePath(hash: string, w: number, h: number | undefined): string {
  const suffix = h ? `${w}x${h}` : `${w}`;
  return path.join(CACHE_DIR(), hash.slice(0, 2), `${hash}-${suffix}.webp`);
}

image.get('/files/:hash/image', async (c) => {
  const hash = c.req.param('hash');
  const file = findFileByHash(hash);
  if (!file) return c.json({ error: 'not found' }, 404);

  const core = getPluginRow('core_metadata', hash) as
    | { content_type?: string }
    | undefined;
  if (!core?.content_type?.startsWith('image/'))
    return c.json({ error: 'not an image' }, 415);

  const w = clamp(Number(c.req.query('w') ?? 400), MIN_DIM, MAX_DIM);
  const rawH = c.req.query('h');
  const h = rawH ? clamp(Number(rawH), MIN_DIM, MAX_DIM) : undefined;

  const cached = cachePath(hash, w, h);

  // Try cache first
  try {
    const data = await readFile(cached);
    c.header('content-type', 'image/webp');
    c.header('cache-control', 'public, max-age=31536000, immutable');
    return c.body(new Uint8Array(data));
  } catch {
    // cache miss
  }

  const release = await acquireResizeSlot();
  let data: Buffer;
  try {
    ({ data } = await sharp(file.storagePath, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: w, height: h, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true }));
  } finally {
    release();
  }

  // Fire-and-forget cache write
  const dir = path.dirname(cached);
  mkdir(dir, { recursive: true })
    .then(() => writeFile(cached, data))
    .catch(() => {});

  c.header('content-type', 'image/webp');
  c.header('cache-control', 'public, max-age=31536000, immutable');
  return c.body(new Uint8Array(data));
});
