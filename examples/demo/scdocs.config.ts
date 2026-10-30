/**
 * Plain object config — no imports needed, so this file works before `scdocs`
 * is even installed. Wrapped in `defineConfig()` when you want editor types:
 *
 *   import { defineConfig } from 'scdocs'
 *   export default defineConfig({ ... })
 */
export default {
  title: 'Demo Token',
  description: 'Example project showing what scdocs generates from NatSpec.',

  // Optional: makes "@file" in the docs link to the exact source revision.
  source: {
    repo: 'https://github.com/your-org/your-repo',
    branch: 'main',
    pathPrefix: 'examples/demo/',
  },

  chains: [
    {
      id: 'anvil',
      name: 'Anvil (local)',
      chainId: 31337,
      rpcUrl: 'http://127.0.0.1:8545',
      testnet: true,
      // Paste the address printed by `forge create` / your deploy script.
      contracts: {},
    },
    {
      id: 'sepolia',
      name: 'Sepolia',
      chainId: 11155111,
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
      explorer: 'https://sepolia.etherscan.io',
      testnet: true,
      contracts: {},
    },
  ],

  // Demo site opens every form so the playground is visible immediately.
  // Drop this (or toggle it in Settings) for a reading-first docs page.
  ui: { expandAll: true },
}
