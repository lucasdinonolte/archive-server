import { stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { config } from "@/config";

export async function waitUntilStable(filePath: string): Promise<void> {
  let lastSize = -1;
  let stableCount = 0;

  while (stableCount < config.stabilityChecksRequired) {
    const { size } = await stat(filePath);
    if (size === lastSize) {
      stableCount++;
    } else {
      stableCount = 0;
      lastSize = size;
    }
    await delay(config.stabilityCheckIntervalMs);
  }
}
