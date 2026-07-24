const args = process.argv.slice(2);
const command = args[0];

function showHelp(): void {
  console.log(
    'Usage: archive <command>\n\n' +
      'Commands:\n' +
      '  watch                          Start API server + file watcher + worker\n' +
      '  backfill                       Re-run stale plugins on existing files\n' +
      '  rebuild                        Rebuild database from sidecars\n' +
      '  upload <path...> [--metadata]  Upload files/folders to remote server\n' +
      '  manage                         Open UI to browse/tag archived items\n' +
      '  --help                         Show this help',
  );
}

async function main(): Promise<void> {
  switch (command) {
    case 'watch': {
      const { watch } = await import('@archive/server/commands');
      await watch();
      return;
    }
    case 'backfill': {
      const { runBackfill } = await import('@archive/server/commands');
      await runBackfill();
      return;
    }
    case 'rebuild': {
      const { runRebuild } = await import('@archive/server/commands');
      await runRebuild();
      return;
    }
    case 'upload': {
      const { upload } = await import('./commands/upload.ts');
      const hasMetadata = args.includes('--metadata');
      const paths = args.slice(1).filter((a) => a !== '--metadata');
      if (paths.length === 0) {
        console.error('Usage: archive upload <path...> [--metadata]');
        process.exit(1);
      }
      await upload(paths, hasMetadata);
      return;
    }
    case 'manage': {
      const { manage } = await import('./commands/manage.ts');
      await manage();
      return;
    }
    case '--help':
    case '-h':
    case undefined: {
      showHelp();
      return;
    }
    default: {
      // Legacy behavior: treat bare paths as upload
      const hasMetadata = args.includes('--metadata');
      const paths = args.filter((a) => a !== '--metadata');
      const { upload } = await import('./commands/upload.ts');
      await upload(paths, hasMetadata);
    }
  }
}

main()
  .then(() => {
    if (command !== 'watch' && command !== 'manage') process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
