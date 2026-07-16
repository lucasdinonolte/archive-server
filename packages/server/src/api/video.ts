import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';

import { Hono } from 'hono';

import { findFileByHash } from '@/storage/db';

export const video = new Hono();

video.get('/files/:hash/video', (c) => {
  const hash = c.req.param('hash');
  const file = findFileByHash(hash);
  if (!file) return c.json({ error: 'not found' }, 404);

  if (!file.contentType?.startsWith('video/'))
    return c.json({ error: 'not a video' }, 415);

  const { size } = statSync(file.storagePath);
  const contentType = file.contentType;
  const range = c.req.header('Range');

  if (range) {
    const [startStr, endStr] = range.replace('bytes=', '').split('-');
    const start = Number(startStr);
    const end = endStr ? Number(endStr) : Math.min(start + 1_000_000, size - 1);

    const stream = createReadStream(file.storagePath, { start, end });

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': contentType,
      },
    });
  }

  const stream = createReadStream(file.storagePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
      'Content-Type': contentType,
    },
  });
});
