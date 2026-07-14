import { readAuthored, writeAuthored } from "@/storage/cas";
import { findFileByHash, upsertAuthoredRow } from "@/storage/db";

export type AuthoredPatch = {
  project?: string | null;
  tags?: string[];
};

/**
 * The single seam for hand-authored metadata. Read-merge-writes the file's
 * `authored.json` sidecar (the source of truth), then upserts the derived DB
 * row — same sidecar-first ordering as {@link applyPlugins}. Auth is enforced by
 * the caller (the /admin routes); this function assumes an authorized request.
 *
 * Throws if the hash isn't in the archive, so a typo'd hash can't strand an
 * orphan sidecar with no file behind it.
 */
export async function setAuthoredMetadata(hash: string, patch: AuthoredPatch): Promise<void> {
  if (!findFileByHash(hash)) {
    throw new Error(`Cannot set authored metadata: no archived file with hash ${hash}`);
  }

  const existing = await readAuthored(hash);
  const merged = {
    hash,
    project: patch.project !== undefined ? patch.project : existing?.project ?? null,
    tags: patch.tags !== undefined ? patch.tags : existing?.tags ?? [],
    updatedAt: new Date().toISOString(),
  };

  await writeAuthored(merged);
  upsertAuthoredRow(hash, { project: merged.project, tags: merged.tags, updatedAt: merged.updatedAt });
}
