import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/commands.ts'],
  format: ['esm'],
  target: 'node22',
  dts: false, // tsup's rollup-plugin-dts is incompatible with TypeScript 7 (tsgo); revisit when supported
  sourcemap: true,
  clean: true,
});
