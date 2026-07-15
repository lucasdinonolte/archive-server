import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { authoredMetadataSchema } from '@archive/shared';

import { setAuthoredMetadata } from '@/authored';
import { config } from '@/config';
import { countFiles, findFileByHash, getStats } from '@/storage/db';

import { getFileDetail, listFilesPage } from './queries';
import { image } from './image';

export const app = new Hono();

app.use('*', cors({ origin: '*' }));

// API key auth for non-GET routes. When no key is configured the server is
// wide-open (useful for local dev); when set, writes require Bearer token.
app.use('*', async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
    return next();
  }

  if (!config.apiKey) {
    return c.json({ error: 'api key not configured' }, 401);
  }

  const header = c.req.header('authorization');
  if (header !== `Bearer ${config.apiKey}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return next();
});

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/stats', (c) => c.json(getStats()));

app.get('/files', (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);
  const files = listFilesPage(limit, offset);
  const total = countFiles();
  return c.json({ files, total, limit, offset });
});

app.get('/files/:hash', (c) => {
  const detail = getFileDetail(c.req.param('hash'));
  return detail ? c.json(detail) : c.json({ error: 'not found' }, 404);
});

app.put('/files/:hash/metadata', async (c) => {
  const hash = c.req.param('hash');
  if (!findFileByHash(hash)) return c.json({ error: 'not found' }, 404);

  const parsed = authoredMetadataSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);

  await setAuthoredMetadata(hash, parsed.data);
  return c.json({ ok: true });
});

app.route('/', image);

app.notFound((c) => c.json({ error: 'not found' }, 404));
