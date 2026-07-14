import { z } from 'zod';

// z.object().parse() already validates, coerces, applies defaults, and throws
// a readable error on bad input — no wrapper needed for a single call site.
const schema = z.object({
  ROOT: z.string().default(process.cwd()),
  STABILITY_INTERVAL_MS: z.coerce.number().default(500),
  STABILITY_CHECKS: z.coerce.number().default(3),
  CONCURRENCY: z.coerce.number().default(2),
  RECONCILE_INTERVAL_MS: z.coerce.number().default(5 * 60_000),
  DEBOUNCE_MS: z.coerce.number().default(300),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('127.0.0.1'),
  VERBOSE: z.coerce.boolean().default(false),
  API_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
