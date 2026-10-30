import { createContext, useContext } from 'react'
import type { PublicClient, WalletClient } from 'viem'
import type { ChainDoc, ContractDoc, DocsBundle, Hex, NativeCurrency } from '../shared/types'

export interface DocsContextValue {
  bundle: DocsBundle
  chain: ChainDoc
  rpcUrl?: string
  explorer?: string
  publicClient: PublicClient | null
  walletClient: WalletClient | null
  account?: Hex
  walletChainId?: number
  walletAvailable: boolean
  /** Wallet is connected but on a different chain than the docs. */
  chainMismatch: boolean
  connect(): void
  disconnect(): void
  switchWalletChain(target?: {
    chainId: number
    name: string
    rpcUrl?: string
    explorerUrl?: string
    nativeCurrency?: NativeCurrency
  }): void
  addressFor(contract: ContractDoc): Hex | undefined
  setAddressFor(contractId: string, address: string): void
  savedAddressFor(contract: ContractDoc): Hex | undefined
  openContract(contractId: string, anchor?: string): void
  expandAll: boolean
  notify(message: string, kind?: 'info' | 'error'): void
}

export const DocsContext = createContext<DocsContextValue | null>(null)

export function useDocs(): DocsContextValue {
  const value = useContext(DocsContext)
  if (!value) throw new Error('useDocs must be used inside <DocsContext.Provider>')
  return value
}
