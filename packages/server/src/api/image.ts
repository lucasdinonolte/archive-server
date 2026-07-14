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

  const { data } = await sharp(file.storagePath)
    .resize({ width: w, height: h, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  // Fire-and-forget cache write
  const dir = path.dirname(cached);
  mkdir(dir, { recursive: true })
    .then(() => writeFile(cached, data))
    .catch(() => {});

  c.header('content-type', 'image/webp');
  c.header('cache-control', 'public, max-age=31536000, immutable');
  return c.body(new Uint8Array(data));
});
