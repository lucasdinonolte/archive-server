import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';

import type { CliConfig } from './config.ts';

export async function scpToRemote(localPath: string, config: CliConfig): Promise<void> {
  const info = await stat(localPath);
  const args = info.isDirectory() ? ['-r', localPath] : [localPath];
  const target = `${config.user}@${config.host}:${config.incomingPath}/`;

  return new Promise((resolve, reject) => {
    execFile('scp', [...args, target], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
