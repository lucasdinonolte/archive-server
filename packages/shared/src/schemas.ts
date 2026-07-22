import { z } from 'zod';

export const authoredMetadataSchema = z.object({
  project: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});
