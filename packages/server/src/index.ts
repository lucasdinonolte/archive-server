import { watch, runBackfill, runRebuild } from "@/commands";
import { logger } from "@/utils/logger";

const commands: Record<string, () => Promise<void>> = {
  watch,
  backfill: runBackfill,
  rebuild: runRebuild,
};

const command = process.argv[2] ?? "watch";
const run = commands[command];

if (!run) {
  logger.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

run()
  .then(() => {
    if (command !== "watch") process.exit(0);
  })
  .catch((err) => {
    logger.error(`Command "${command}" failed:`, err);
    process.exit(1);
  });
