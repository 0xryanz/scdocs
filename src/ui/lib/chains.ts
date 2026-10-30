import type { ChainDoc, DocsBundle, NativeCurrency } from '../../shared/types'

export interface BuiltinChain {
  chainId: number
  name: string
  rpcUrl: string
  explorerUrl?: string
  testnet?: boolean
  nativeCurrency: NativeCurrency
}

const ETH: NativeCurrency = { name: 'Ether', symbol: 'ETH', decimals: 18 }

/**
 * Keyless public endpoints, used only as a default so the page works before you
 * configure anything. They are rate limited — anyone doing real work should set
 * their own RPC in the settings drawer.
 */
export const BUILTINS: BuiltinChain[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: ETH,
  },
  {
    chainId: 11155111,
    name: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    testnet: true,
    nativeCurrency: ETH,
  },
  {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://base-rpc.publicnode.com',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: ETH,
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://base-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.basescan.org',
    testnet: true,
    nativeCurrency: ETH,
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: ETH,
  },
  {
    chainId: 10,
    name: 'OP Mainnet',
    rpcUrl: 'https://optimism-rpc.publicnode.com',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: ETH,
  },
  {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  },
  {
    chainId: 31337,
    name: 'Anvil / Local',
    rpcUrl: 'http://127.0.0.1:8545',
    testnet: true,
    nativeCurrency: ETH,
  },
]

export function builtinByChainId(chainId: number): BuiltinChain | undefined {
  return BUILTINS.find((chain) => chain.chainId === chainId)
}

export function isBuiltinKey(key: string | undefined): boolean {
  return Boolean(key?.startsWith('builtin:'))
}

export function chainIdFromKey(key: string): number | undefined {
  if (!key?.startsWith('builtin:')) return undefined
  const id = Number(key.slice('builtin:'.length))
  return Number.isFinite(id) ? id : undefined
}

export function builtinChainDoc(chainId: number): ChainDoc {
  const meta = builtinByChainId(chainId)
  const resolved =
    meta ??
    ({
      chainId,
      name: `Chain ${chainId}`,
      rpcUrl: '',
      nativeCurrency: ETH,
    } as BuiltinChain)

  return {
    id: `builtin:${chainId}`,
    name: resolved.name,
    chainId: resolved.chainId,
    rpcUrl: resolved.rpcUrl || undefined,
    explorerUrl: resolved.explorerUrl,
    testnet: resolved.testnet,
    nativeCurrency: resolved.nativeCurrency,
    addresses: {},
  }
}

/** The RPC actually used: user override > config > built-in default. */
export function resolveRpc(chain: ChainDoc, overrides: Record<string, string>): string | undefined {
  const override = overrides[String(chain.chainId)]
  if (override && override.trim().length > 0) return override.trim()
  if (chain.rpcUrl) return chain.rpcUrl
  return builtinByChainId(chain.chainId)?.rpcUrl
}

export function resolveExplorer(
  chain: ChainDoc,
  overrides: Record<string, string>,
): string | undefined {
  void overrides
  if (chain.explorerUrl) return chain.explorerUrl.replace(/\/$/, '')
  const builtin = builtinByChainId(chain.chainId)
  return builtin?.explorerUrl?.replace(/\/$/, '')
}

export function initialChainKey(bundle: DocsBundle, stored?: string): string {
  if (stored) {
    const exists =
      bundle.chains.some((chain) => chain.id === stored) ||
      (isBuiltinKey(stored) && chainIdFromKey(stored) !== undefined)
    if (exists) return stored
  }
  return bundle.chains[0]?.id ?? bundle.ui?.defaultChain ?? 'builtin:1'
}

export function resolveChain(bundle: DocsBundle, key: string): ChainDoc {
  const configured = bundle.chains.find((chain) => chain.id === key)
  if (configured) return configured
  const chainId = chainIdFromKey(key)
  if (chainId !== undefined) return builtinChainDoc(chainId)
  return bundle.chains[0] ?? builtinChainDoc(1)
}
