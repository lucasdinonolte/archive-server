import type { Plugin } from './types';
import { coreMetadataPlugin } from './coreMetadata';
import { imageMetadataPlugin } from './imageMetadata';
import { createClipPlugin } from './clipPlugin';

import { logger } from "@/utils/logger";

export const pluginRegistry: Array<Plugin> = [
  coreMetadataPlugin,
  imageMetadataPlugin,
  // Add other plugins here
];

export const loadAsyncPlugins = async (): Promise<void> => {
  const clipPlugin = await createClipPlugin();
  pluginRegistry.push(clipPlugin);
  logger.debug(`Loaded async plugin: ${clipPlugin.id}`);
}
