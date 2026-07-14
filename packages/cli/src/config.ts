import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type CliConfig = {
  host: string;
  user: string;
  incomingPath: string;
  apiUrl: string;
  apiKey?: string;
};

const CONFIG_PATH = path.join(os.homedir(), '.config', 'archive', 'config.json');

export function loadConfig(): CliConfig {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf8');
  } catch {
    console.error(
      `Config not found at ${CONFIG_PATH}\n\n` +
        'Create it with:\n\n' +
        '  mkdir -p ~/.config/archive\n' +
        '  cat > ~/.config/archive/config.json << EOF\n' +
        '  {\n' +
        '    "host": "your-server",\n' +
        '    "user": "your-user",\n' +
        '    "incomingPath": "/path/to/incoming",\n' +
        '    "apiUrl": "http://your-server:3000",\n' +
        '    "apiKey": "your-api-key"\n' +
        '  }\n' +
        '  EOF',
    );
    process.exit(1);
  }

  return JSON.parse(raw) as CliConfig;
}
