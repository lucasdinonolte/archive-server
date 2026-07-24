import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';

import { loadConfig } from '../config.ts';
import { scpToRemote } from '../scp.ts';
import { startUiServer } from '../serve.ts';

const MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'tiff', 'bmp',
  'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi',
]);

function isMedia(path: string): boolean {
  return MEDIA_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');
}

async function expandPaths(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const p of paths) {
    if ((await stat(p)).isDirectory()) {
      const entries = await readdir(p, { recursive: true, withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && isMedia(e.name)) files.push(join(e.parentPath, e.name));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function openBrowser(url: string): void {
  execFile('open', [url], (err) => {
    if (err) console.error('Failed to open browser:', err.message);
  });
}

export async function upload(paths: string[], openMetadata: boolean): Promise<void> {
  const config = loadConfig();

  const files = await expandPaths(paths);

  for (const p of files) {
    console.log(`Uploading ${p}...`);
    await scpToRemote(p, config);
    console.log(`Done: ${p}`);
  }

  if (openMetadata) {
    const { url } = await startUiServer(config.apiUrl, config.apiKey);
    console.log(`UI running at ${url}`);
    openBrowser(url);
  }
}
