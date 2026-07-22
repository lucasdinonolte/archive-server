import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { authoredMetadataSchema } from '@archive/shared';

import { setAuthoredMetadata } from '@/authored';
import { config } from '@/config';
import { countFiles, countFilesFiltered, getAllCustomFieldKeys, getAllProjects, getAllTags, getStats, resolveHashPrefix } from '@/storage/db';
import type { FileFilter, FileRecord } from '@/storage/db';

import { getFileDetail, listFilesPage } from './queries';
import { image } from './image';
import { video } from './video';

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

app.get('/tags', (c) => c.json({ tags: getAllTags() }));

app.get('/projects', (c) => c.json({ projects: getAllProjects() }));

app.get('/custom-field-keys', (c) => c.json({ keys: getAllCustomFieldKeys() }));

app.get('/files', (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);

  const tags = c.req.queries('tag');
  const projects = c.req.queries('project');

  const url = new URL(c.req.url);
  const customFields: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('cf.')) customFields[key.slice(3)] = value;
  }

  const filter: FileFilter = {
    tags: tags?.length ? tags : undefined,
    projects: projects?.length ? projects : undefined,
    customFields: Object.keys(customFields).length ? customFields : undefined,
  };
  const hasFilter = filter.tags || filter.projects || filter.customFields;

  const files = listFilesPage(limit, offset, hasFilter ? filter : undefined);
  const total = hasFilter ? countFilesFiltered(filter) : countFiles();
  return c.json({ files, total, limit, offset });
});

app.get('/files/:hash', (c) => {
  const resolved = handleHashParam(c.req.param('hash'), c);
  if (resolved instanceof Response) return resolved;
  const detail = getFileDetail(resolved.file.hash);
  return detail ? c.json(detail) : c.json({ error: 'not found' }, 404);
});

app.put('/files/:hash/metadata', async (c) => {
  const resolved = handleHashParam(c.req.param('hash'), c);
  if (resolved instanceof Response) return resolved;
  const hash = resolved.file.hash;

  const parsed = authoredMetadataSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);

  await setAuthoredMetadata(hash, parsed.data);
  return c.json({ ok: true });
});

function handleHashParam(prefix: string, c: { json: (data: unknown, status?: number) => Response }): { file: FileRecord } | Response {
  const result = resolveHashPrefix(prefix);
  switch (result.kind) {
    case 'found': return { file: result.file };
    case 'not_found': return c.json({ error: 'not found' }, 404);
    case 'ambiguous': return c.json({ error: 'ambiguous hash prefix', candidates: result.candidates }, 400);
  }
}

app.route('/', image);
app.route('/', video);

app.notFound((c) => c.json({ error: 'not found' }, 404));
