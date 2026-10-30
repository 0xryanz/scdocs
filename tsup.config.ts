import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { cli: 'src/cli/index.ts', index: 'src/core/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  dts: false,
  clean: false,
  sourcemap: false,
  splitting: false,
  external: ['vite', 'react', 'react-dom', 'viem', 'jiti'],
  banner: { js: '#!/usr/bin/env node' },
})
