import type {
  PublicFileListItem,
  PublicFileDetail,
  AuthoredMetadataPatch,
} from '@archive/shared';

const params = new URLSearchParams(window.location.search);
const API_URL = params.get('api') ?? 'http://localhost:3000';
const API_KEY = params.get('key') ?? '';

export async function listFiles(
  limit = 50,
  offset = 0,
): Promise<{ files: PublicFileListItem[]; total: number; limit: number; offset: number }> {
  const res = await fetch(`${API_URL}/files?limit=${limit}&offset=${offset}`);
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

export function imageUrl(hash: string, width = 200): string {
  return `${API_URL}/files/${hash}/image?w=${width}`;
}
