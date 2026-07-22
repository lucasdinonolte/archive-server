export type ProjectedFields = {
  project: string | null;
  tags: string[];
  customFields: Record<string, string>;
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

export type PublicFileListItem = {
  hash: string;
  originalFilename: string;
  ingestedAt: string;
} & Partial<ProjectedFields>;

export type PublicFileDetail = PublicFileListItem & {
  plugins: Record<string, unknown>;
};

/** @deprecated Use PublicFileDetail instead */
export type PublicFile = PublicFileDetail;

/** @deprecated Use PublicFileListItem instead */
export type FileListItem = PublicFileListItem;

/** @deprecated Use PublicFileDetail instead */
export type FileDetail = PublicFileDetail;

export type AuthoredMetadata = {
  project: string | null;
  tags: string[];
  customFields: Record<string, string>;
  updatedAt: string;
};

export type AuthoredMetadataPatch = {
  project?: string | null;
  tags?: string[];
  customFields?: Record<string, string>;
};
