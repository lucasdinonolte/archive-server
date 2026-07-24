import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { authoredMetadataSchema } from '@archive/shared';

import { setAuthoredMetadata } from '@/authored';
import { config } from '@/config';
import type { BlobStorage } from '@/storage/blobStorage';
import type { JobQueue } from '@/storage/jobQueue';
import { pluginRegistry } from '@/plugins/registry';
import type { ServingAPI, ServingContext } from '@/plugins/types';
import { countFiles, countFilesFiltered, getAllCustomFieldKeys, getAllProjects, getAllTags, getStats, resolveHashPrefix } from '@/storage/db';
import type { FileFilter, FileRecord } from '@/storage/db';

import { getFileDetail, listFilesPage } from './queries';

function createServingAPI(storage: BlobStorage, hash: string, ext: string): ServingAPI {
  const ref = { hash, ext };
  return {
    localPath: () => storage.localPath(ref),
    blobSize: () => storage.blobSize(ref),
    createReadStream: (opts) => storage.createReadStream(ref, opts),
    readDerived: (signature, derivedExt) => storage.readDerived({ hash, signature, ext: derivedExt }),
    writeDerived: (signature, derivedExt, data) => storage.writeDerived({ hash, signature, ext: derivedExt }, data),
    hasDerived: (signature, derivedExt) => storage.hasDerived({ hash, signature, ext: derivedExt }),
  };
}

export function createApp(storage: BlobStorage, jobQueue?: JobQueue) {
  const app = new Hono();

  app.use('*', cors({ origin: '*' }));

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

    await setAuthoredMetadata(hash, parsed.data, storage);
    return c.json({ ok: true });
  });

  // --- Job status endpoints ---
  if (jobQueue) {
    app.get('/jobs/stats', (c) => c.json(jobQueue.stats()));

    app.get('/files/:hash/jobs', (c) => {
      const resolved = handleHashParam(c.req.param('hash'), c);
      if (resolved instanceof Response) return resolved;
      return c.json(jobQueue.fileJobs(resolved.file.hash));
    });
  }

  // --- Generic serving route ---
  app.get('/files/:hash/serve/:format?', async (c) => {
    const resolved = handleHashParam(c.req.param('hash'), c);
    if (resolved instanceof Response) return resolved;
    const file = resolved.file;
    const format = c.req.param('format') ?? '';

    const ext = file.storagePath.match(/\.[^.]+$/)?.[0] ?? "";
    const fileCtx = {
      hash: file.hash,
      ext,
      contentType: file.contentType ?? "application/octet-stream",
      originalFilename: file.originalFilename,
    };

    const url = new URL(c.req.url);
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      query[key] = value;
    }

    const servingCtx: ServingContext = {
      ...fileCtx,
      requestPath: format,
      query,
      range: c.req.header('Range'),
    };

    const api = createServingAPI(storage, file.hash, ext);

    for (const plugin of pluginRegistry) {
      if (!plugin.serving) continue;
      if (!plugin.serving.formats.includes(format)) continue;
      if (!plugin.appliesTo({ ...fileCtx, storagePath: file.storagePath, sizeBytes: file.sizeBytes ?? 0, mtimeMs: 0 })) continue;

      const result = await plugin.serving.serve(servingCtx, api);
      if (!result) continue;

      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      });
    }

    return c.json({ error: 'no serving plugin for this format' }, 415);
  });

  // --- Backwards-compatible redirects ---
  app.get('/files/:hash/image', (c) => {
    const hash = c.req.param('hash');
    const url = new URL(c.req.url);
    const params = url.searchParams.toString();
    const qs = params ? `?${params}` : '';
    return c.redirect(`/files/${hash}/serve/webp${qs}`, 301);
  });

  app.get('/files/:hash/video', (c) => {
    const hash = c.req.param('hash');
    return c.redirect(`/files/${hash}/serve/mp4`, 301);
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  return app;
}

function handleHashParam(prefix: string, c: { json: (data: unknown, status?: number) => Response }): { file: FileRecord } | Response {
  const result = resolveHashPrefix(prefix);
  switch (result.kind) {
    case 'found': return { file: result.file };
    case 'not_found': return c.json({ error: 'not found' }, 404);
    case 'ambiguous': return c.json({ error: 'ambiguous hash prefix', candidates: result.candidates }, 400);
  }
}
