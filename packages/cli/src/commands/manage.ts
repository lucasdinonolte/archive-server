import { execFile } from 'node:child_process';

import { loadConfig } from '../config.ts';
import { startUiServer } from '../serve.ts';

function openBrowser(url: string): void {
  execFile('open', [url], (err) => {
    if (err) console.error('Failed to open browser:', err.message);
  });
}

export async function manage(): Promise<void> {
  const config = loadConfig();
  const { url } = await startUiServer(config.apiUrl, config.apiKey);
  console.log(`UI running at ${url}`);
  openBrowser(url);
}
