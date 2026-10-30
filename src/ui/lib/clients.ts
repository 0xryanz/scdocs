import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { ChainDoc } from '../../shared/types'
import type { Eip1193Provider } from './wallet'

const FALLBACK_RPC = 'http://127.0.0.1:8545'

export function toViemChain(chain: ChainDoc, rpcUrl?: string): Chain {
  const url = rpcUrl ?? chain.rpcUrl ?? FALLBACK_RPC
  return {
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency ?? { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [url] } },
    blockExplorers: chain.explorerUrl
      ? { default: { name: 'Explorer', url: chain.explorerUrl } }
      : undefined,
    testnet: chain.testnet,
  }
}

/**
 * One client for reads and simulations.
 *
 * When the wallet is on the right chain we go through the wallet's transport,
 * so simulations see exactly what the wallet will see (including any custom
 * RPC the user has configured in their wallet).
 */
export function makePublicClient(
  chain: ChainDoc,
  rpcUrl: string | undefined,
  provider?: Eip1193Provider,
): PublicClient | null {
  const viemChain = toViemChain(chain, rpcUrl)
  if (provider) {
    return createPublicClient({ chain: viemChain, transport: custom(provider), pollingInterval: 4000 })
  }
  if (!rpcUrl) return null
  return createPublicClient({ chain: viemChain, transport: http(rpcUrl), pollingInterval: 4000 })
}

export function makeWalletClient(
  chain: ChainDoc,
  rpcUrl: string | undefined,
  provider: Eip1193Provider,
  account: Hex,
): WalletClient {
  return createWalletClient({
    account,
    chain: toViemChain(chain, rpcUrl),
    transport: custom(provider),
  })
}
