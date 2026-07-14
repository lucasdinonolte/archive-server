import {
  encodePluginResult,
  readSidecar,
  writeSidecar,
  type SidecarPluginEntry,
} from "@/storage/cas";
import { upsertFileRecord, upsertPluginRow } from "@/storage/db";
import { runPlugins } from "@/plugins/runner";
import type { FileContext, Plugin } from "@/plugins/types";

/**
 * Runs `plugins` against a file already in the content store, merges their
 * results into the file's sidecar (leaving every other plugin's data untouched),
 * and upserts the derived database rows.
 *
 * Shared by ingest (all applicable plugins on a fresh file) and backfill (only
 * the stale subset on an existing file). The sidecar is written before the
 * database rows, keeping the sidecar the source of truth: a crash in between
 * leaves the DB behind, never ahead, and the next rebuild closes the gap.
 *
 * `ingestedAt` is only used when no sidecar exists yet; for an existing file the
 * original ingest time is preserved.
 *
 * Write order matters: sidecar first (the source of truth), then the file row,
 * then the plugin rows — which the foreign key requires to point at an existing
 * file. A crash mid-way leaves the DB behind the sidecar, never ahead.
 */
export async function applyPlugins(ctx: FileContext, plugins: Plugin[], ingestedAt: string): Promise<void> {
  const results = await runPlugins(ctx, plugins);

  const existing = await readSidecar(ctx.hash);
  const resolvedIngestedAt = existing?.ingestedAt ?? ingestedAt;
  const entries: Record<string, SidecarPluginEntry> = { ...existing?.plugins };
  for (const [id, result] of Object.entries(results)) {
    entries[id] = encodePluginResult(result);
  }

  await writeSidecar({
    hash: ctx.hash,
    originalFilename: ctx.originalFilename,
    ingestedAt: resolvedIngestedAt,
    storagePath: ctx.storagePath,
    plugins: entries,
  });

  upsertFileRecord({
    hash: ctx.hash,
    storagePath: ctx.storagePath,
    originalFilename: ctx.originalFilename,
    ingestedAt: resolvedIngestedAt,
  });

  for (const plugin of plugins) {
    if (!plugin.schema) continue;
    const result = results[plugin.id];
    if (result) upsertPluginRow(plugin.schema, ctx.hash, result.data);
  }
}
