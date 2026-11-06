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
    rollupOptions: {
      output: {
        // Keep the Ethereum client and React in their own cacheable chunks.
        // The app shell is small; viem/ox is the bulk of the bundle.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(viem|ox|abitype|@noble|@scure)\//.test(id)) return 'evm'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          return undefined
        },
      },
    },
  },
  server: { port: 5173 },
})
