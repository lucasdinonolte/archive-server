export type FileListItem = {
  hash: string;
  storagePath: string;
  originalFilename: string;
  ingestedAt: string;
  size_bytes?: unknown;
  content_type?: unknown;
  mtime_ms?: unknown;
};

export type FileDetail = {
  hash: string;
  storagePath: string;
  originalFilename: string;
  ingestedAt: string;
  authored: AuthoredMetadata | null;
  plugins: Record<string, unknown>;
};

export type AuthoredMetadata = {
  project: string | null;
  tags: string[];
  updatedAt: string;
};

export type AuthoredMetadataPatch = {
  project?: string | null;
  tags?: string[];
};
