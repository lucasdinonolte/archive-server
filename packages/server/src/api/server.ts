import type { Server } from 'node:http'

import { createAdaptorServer } from '@hono/node-server'

import { config } from '@/config'
import { logger } from "@/utils/logger";

import { app } from './app'

export async function startApiServer(): Promise<Server | undefined> {
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;

  return new Promise((resolve) => {
    server.listen(config.apiPort, config.apiHost, () => resolve(server));
    logger.info(`API server listening on http://${config.apiHost}:${config.apiPort}`);
  });
}
