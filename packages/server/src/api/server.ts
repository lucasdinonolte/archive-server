import type { Server } from 'node:http'

import { createAdaptorServer } from '@hono/node-server'

import { config } from '@/config'
import type { BlobStorage } from '@/storage/blobStorage'
import type { JobQueue } from '@/storage/jobQueue'
import { logger } from "@/utils/logger";

import { createApp } from './app'

export async function startApiServer(storage: BlobStorage, jobQueue?: JobQueue): Promise<Server | undefined> {
  const app = createApp(storage, jobQueue);
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;

  return new Promise((resolve) => {
    server.listen(config.apiPort, config.apiHost, () => resolve(server));
    logger.info(`API server listening on http://${config.apiHost}:${config.apiPort}`);
  });
}
