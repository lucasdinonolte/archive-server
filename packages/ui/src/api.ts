import type {
  PublicFileListItem,
  PublicFileDetail,
  AuthoredMetadataPatch,
} from '@archive/shared';

const params = new URLSearchParams(window.location.search);
const API_URL = params.get('api') ?? 'http://localhost:3000';
const API_KEY = params.get('key') ?? '';

export type FileFilters = {
  tags?: string[];
  projects?: string[];
};

export async function listFiles(
  limit = 50,
  offset = 0,
  filters?: FileFilters,
): Promise<{ files: PublicFileListItem[]; total: number; limit: number; offset: number }> {
  const url = new URL(`${API_URL}/files`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (filters?.tags) for (const t of filters.tags) url.searchParams.append('tag', t);
  if (filters?.projects) for (const p of filters.projects) url.searchParams.append('project', p);
  const res = await fetch(url);
  return res.json();
}

export async function getFileDetail(hash: string): Promise<PublicFileDetail> {
  const res = await fetch(`${API_URL}/files/${hash}`);
  return res.json();
}

export async function updateMetadata(hash: string, patch: AuthoredMetadataPatch): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (API_KEY) headers['authorization'] = `Bearer ${API_KEY}`;

  await fetch(`${API_URL}/files/${hash}/metadata`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(patch),
  });
}

export async function listTags(): Promise<string[]> {
  const res = await fetch(`${API_URL}/tags`);
  const data = await res.json();
  return data.tags;
}

export async function listProjects(): Promise<string[]> {
  const res = await fetch(`${API_URL}/projects`);
  const data = await res.json();
  return data.projects;
}

export function imageUrl(hash: string, width = 200): string {
  return `${API_URL}/files/${hash}/image?w=${width}`;
}
