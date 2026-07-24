import type { Plugin } from './types';
import { coreMetadataPlugin } from './coreMetadata';
import { imageMetadataPlugin } from './imageMetadata';
import { imageServingPlugin } from './imageServing';
import { videoServingPlugin } from './videoServing';
import { createClipPlugin } from './clipPlugin';

import { logger } from "@/utils/logger";

export const pluginRegistry: Array<Plugin> = [
  coreMetadataPlugin,
  imageMetadataPlugin,
  imageServingPlugin,
  videoServingPlugin,
];

export const loadAsyncPlugins = async (): Promise<void> => {
  const clipPlugin = await createClipPlugin();
  pluginRegistry.push(clipPlugin);
  logger.debug(`Loaded async plugin: ${clipPlugin.id}`);
}
