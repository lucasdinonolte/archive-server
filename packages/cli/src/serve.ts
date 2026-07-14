import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolves the built UI dist directory relative to the monorepo layout. */
function uiDistDir(): string {
  // In dev: packages/cli/src/serve.ts -> ../../ui/dist
  // In build: packages/cli/dist/index.js -> ../../ui/dist
  return path.resolve(__dirname, '..', '..', 'ui', 'dist');
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
};

/**
 * Starts a local static server for the built Vite SPA.
 * Returns the URL the browser should open (includes the API URL as a query param).
 */
export async function startUiServer(apiUrl: string, apiKey?: string): Promise<{ url: string; close: () => void }> {
  const dist = uiDistDir();

  const server = createServer(async (req, res) => {
    const urlPath = new URL(req.url ?? '/', `http://localhost`).pathname;
    const filePath = path.join(dist, urlPath === '/' ? 'index.html' : urlPath);
    const ext = path.extname(filePath);

    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME_TYPES[ext] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      // SPA fallback: serve index.html for non-file paths
      try {
        const index = await readFile(path.join(dist, 'index.html'));
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(index);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const params = new URLSearchParams({ api: apiUrl });
      if (apiKey) params.set('key', apiKey);
      const url = `http://127.0.0.1:${port}?${params}`;
      resolve({ url, close: () => server.close() });
    });
  });
}
