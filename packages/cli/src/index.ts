import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig } from './config.ts';
import { scpToRemote } from './scp.ts';
import { startUiServer } from './serve.ts';

const MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'tiff', 'bmp',
  'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi',
]);

function isMedia(path: string): boolean {
  return MEDIA_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');
}

// Expand directories into their media files (recursive); pass files through as-is.
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

async function sendFiles(paths: string[], openMetadata: boolean): Promise<void> {
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

async function manage(): Promise<void> {
  const config = loadConfig();
  const { url } = await startUiServer(config.apiUrl, config.apiKey);
  console.log(`UI running at ${url}`);
  openBrowser(url);
}

const args = process.argv.slice(2);

if (args[0] === 'manage') {
  manage().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (args.length === 0 || args[0] === '--help') {
  console.log(
    'Usage:\n' +
      '  archive <path...> [--metadata]  Upload files or folders (recursively finds images/videos), optionally open UI to tag\n' +
      '  archive manage                Open UI to browse/tag all archived items',
  );
} else {
  const hasMetadata = args.includes('--metadata');
  const paths = args.filter((a) => a !== '--metadata');
  sendFiles(paths, hasMetadata).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
