import { defineConfig } from 'vite'

// The UI is a single-page static app: no router, no server, relative asset paths
// so the built folder can be dropped anywhere (sub-path, IPFS, file://).
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: 'dist/ui',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 8192,
    rollupOptions: { output: { manualChunks: undefined } },
  },
  server: { port: 5173 },
})
