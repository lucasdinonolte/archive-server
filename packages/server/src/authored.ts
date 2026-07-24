import type { AuthoredMetadataPatch } from '@archive/shared';

import type { BlobStorage } from "@/storage/blobStorage";
import { findFileByHash, updateAuthoredFields, replaceTags, replaceCustomFields } from "@/storage/db";

/**
 * The single seam for hand-authored metadata. Read-merge-writes the file's
 * `authored.json` sidecar (the source of truth), then upserts the derived DB
 * row — same sidecar-first ordering as {@link applyPlugins}.
 *
 * Throws if the hash isn't in the archive, so a typo'd hash can't strand an
 * orphan sidecar with no file behind it.
 */
export async function setAuthoredMetadata(hash: string, patch: AuthoredMetadataPatch, storage: BlobStorage): Promise<void> {
  if (!findFileByHash(hash)) {
    throw new Error(`Cannot set authored metadata: no archived file with hash ${hash}`);
  }

  const existing = await storage.readAuthored(hash);
  const merged = {
    hash,
    project: patch.project !== undefined ? patch.project : existing?.project ?? null,
    tags: patch.tags !== undefined ? patch.tags : existing?.tags ?? [],
    customFields: patch.customFields !== undefined ? patch.customFields : existing?.customFields ?? {},
    updatedAt: new Date().toISOString(),
  };

  await storage.writeAuthored(merged);
  updateAuthoredFields(hash, merged.project, merged.updatedAt);
  replaceTags(hash, 'authored', merged.tags);
  replaceCustomFields(hash, merged.customFields);
}
