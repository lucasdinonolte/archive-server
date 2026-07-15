export type ProjectedFields = {
  // From authored metadata
  project: string | null;
  tags: string[];
  // From core-metadata
  contentType: string;
  sizeBytes: number;
  // From image-metadata (optional — only images)
  width: number;
  height: number;
  format: string;
  colorSpace: string;
  dpi: number;
  dominantColor: string;
};

export type PublicFile = {
  hash: string;
  originalFilename: string;
  ingestedAt: string;
  plugins: Record<string, unknown>;
} & Partial<ProjectedFields>;

/** @deprecated Use PublicFile instead */
export type FileListItem = PublicFile;

/** @deprecated Use PublicFile instead */
export type FileDetail = PublicFile;

export type AuthoredMetadata = {
  project: string | null;
  tags: string[];
  updatedAt: string;
};

export type AuthoredMetadataPatch = {
  project?: string | null;
  tags?: string[];
};
