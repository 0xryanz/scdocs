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

  // Authored pages show up above the contract list in the sidebar.
  pages: [
    { title: 'Overview', file: 'docs/overview.md', description: 'What DemoToken is and what this site can do.' },
    { title: 'Architecture', file: 'docs/architecture.md' },
    { title: 'Deployment', file: 'docs/deployment.md' },
  ],

  // Sidebar order. Unlisted contracts keep alphabetical order after these.
  order: ['DemoToken'],

  brand: {
    color: '#f97316',
    footer: 'Demo docs · built with scdocs',
  },

  // Reading-first by default: method forms start collapsed.
  // Set `ui: { expandAll: true }` (or use the Settings drawer) to open them all.
}
