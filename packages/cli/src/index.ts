import { execFile } from 'node:child_process';

import { loadConfig } from './config.ts';
import { scpToRemote } from './scp.ts';
import { startUiServer } from './serve.ts';

function openBrowser(url: string): void {
  execFile('open', [url], (err) => {
    if (err) console.error('Failed to open browser:', err.message);
  });
}

async function sendFiles(paths: string[], openMetadata: boolean): Promise<void> {
  const config = loadConfig();

  for (const p of paths) {
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
      '  archive <path> [--metadata]   Upload files, optionally open UI to tag\n' +
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
