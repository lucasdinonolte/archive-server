import path from "node:path";
import { env } from "@/config/env";

export const config = {
  incomingDir: path.join(env.ROOT, "incoming"),
  storageDir: path.join(env.ROOT, "storage"),
  dbPath: path.join(env.ROOT, "archive.db"),
  stabilityCheckIntervalMs: env.STABILITY_INTERVAL_MS,
  stabilityChecksRequired: env.STABILITY_CHECKS,
  concurrency: env.CONCURRENCY,
  reconcileIntervalMs: env.RECONCILE_INTERVAL_MS,
  debounceMs: env.DEBOUNCE_MS,
  clipModelId: 'Xenova/clip-vit-base-patch32',
  apiPort: env.API_PORT,
  apiHost: env.API_HOST,
  apiKey: env.API_KEY,
};
