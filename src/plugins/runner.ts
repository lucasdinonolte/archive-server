import type { FileContext, Plugin, PluginResult } from "./types";

import { logger } from "@/utils/logger";

/**
 * Runs the given plugins against a file, tagging each result with the plugin
 * version and the time it ran. Callers decide which plugins to pass — all
 * applicable ones on ingest, or just the stale subset on backfill. A plugin that
 * throws is logged and omitted; its absence means the next backfill retries it.
 */
export async function runPlugins(ctx: FileContext, plugins: Plugin[]): Promise<Record<string, PluginResult>> {
  const results: Record<string, PluginResult> = {};

  await Promise.all(
    plugins.map(async (plugin) => {
      try {
        const data = await plugin.analyze(ctx);
        results[plugin.id] = {
          version: plugin.version,
          computedAt: new Date().toISOString(),
          data,
        };
      } catch (err) {
        logger.error(`Plugin "${plugin.id}" failed for ${ctx.originalFilename}:`, err);
      }
    })
  );

  return results;
}
