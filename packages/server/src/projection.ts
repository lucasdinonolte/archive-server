import type { ProjectedFields } from '@archive/shared';
import type { ColumnValue, Plugin } from '@/plugins/types';

/**
 * Runs each plugin's `project()` against its raw data to compute the projected
 * fields that live on the `files` table. Skips the CLIP plugin — its tags go
 * into the normalized `tags` table instead, extracted via {@link extractClipTags}.
 */
export function computeProjectedFields(
  plugins: Plugin[],
  pluginData: Record<string, Record<string, ColumnValue>>,
): Partial<Omit<ProjectedFields, 'tags' | 'project'>> {
  let ctx: Partial<Omit<ProjectedFields, 'tags' | 'project'>> = {};

  for (const plugin of plugins) {
    if (plugin.id === 'image-clip') continue;
    if (!plugin.project) continue;
    const data = pluginData[plugin.id];
    if (!data) continue;
    const projected = plugin.project(data, { ...ctx });
    const { tags, project, ...rest } = projected;
    ctx = { ...ctx, ...rest };
  }

  return ctx;
}

/** Parses the CLIP plugin's JSON `[{tag, score}]` column into a flat tag list. */
export function extractClipTags(data: Record<string, ColumnValue>): string[] {
  const raw = data.tags as string | null;
  if (!raw) return [];
  return (JSON.parse(raw) as Array<{ tag: string }>).map((t) => t.tag);
}
