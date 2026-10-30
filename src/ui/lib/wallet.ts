import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toHex } from 'viem'
import type { Hex, NativeCurrency } from '../../shared/types'

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>
  on?(event: string, handler: (...args: any[]) => void): void
  removeListener?(event: string, handler: (...args: any[]) => void): void
  isMetaMask?: boolean
  providers?: Eip1193Provider[]
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

/** Multi-wallet browsers expose `providers`; prefer MetaMask as the default. */
export function getInjectedProvider(): Eip1193Provider | undefined {
  const injected = window.ethereum
  if (!injected) return undefined
  const list = injected.providers
  if (Array.isArray(list) && list.length > 0) {
    return list.find((provider) => provider.isMetaMask) ?? list[0]
  }
  return injected
}

export interface SwitchChainParams {
  chainId: number
  name: string
  rpcUrl?: string
  explorerUrl?: string
  nativeCurrency?: NativeCurrency
}

export interface WalletApi {
  available: boolean
  address?: Hex
  chainId?: number
  connecting: boolean
  error?: string
  connect(): Promise<void>
  disconnect(): void
  switchChain(params: SwitchChainParams): Promise<void>
}

function parseChainId(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = value.startsWith('0x') ? Number.parseInt(value, 16) : Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function useWallet(): WalletApi {
  const [address, setAddress] = useState<Hex>()
  const [chainId, setChainId] = useState<number>()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string>()
  const provider = useMemo(() => (typeof window === 'undefined' ? undefined : getInjectedProvider()), [])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Restore an existing session without prompting (eth_accounts never pops a UI).
  useEffect(() => {
    if (!provider) return
    let cancelled = false
    void (async () => {
      try {
        const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
        const current = (await provider.request({ method: 'eth_chainId' })) as string
        if (cancelled || !mounted.current) return
        if (accounts?.length) setAddress(accounts[0] as Hex)
        setChainId(parseChainId(current))
      } catch {
        /* wallet locked — ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(() => {
    if (!provider?.on) return
    const onAccounts = (...args: any[]) => {
      const accounts = args[0] as string[] | undefined
      setAddress(accounts?.length ? (accounts[0] as Hex) : undefined)
    }
    const onChain = (...args: any[]) => {
      const next = parseChainId(args[0])
      if (next !== undefined) setChainId(next)
    }
    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts)
      provider.removeListener?.('chainChanged', onChain)
    }
  }, [provider])

  const connect = useCallback(async () => {
    if (!provider) {
      setError('No browser wallet detected. Install MetaMask or any EIP-1193 wallet.')
      return
    }
    setConnecting(true)
    setError(undefined)
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const current = (await provider.request({ method: 'eth_chainId' })) as string
      if (accounts?.length) setAddress(accounts[0] as Hex)
      setChainId(parseChainId(current))
    } catch (caught) {
      const message = (caught as any)?.message ?? String(caught)
      setError(/reject|denied/i.test(message) ? 'Connection request rejected' : message)
    } finally {
      setConnecting(false)
    }
  }, [provider])

  const disconnect = useCallback(() => {
    setAddress(undefined)
    setError(undefined)
  }, [])

  const switchChain = useCallback(
    async (params: SwitchChainParams) => {
      if (!provider) throw new Error('No wallet connected')
      const chainIdHex = toHex(params.chainId)
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        })
      } catch (caught) {
        const code = (caught as any)?.code
        if (code !== 4902 && code !== -32603) throw caught
        if (!params.rpcUrl) {
          throw new Error(
            `Your wallet does not know chain ${params.chainId}. Add an RPC URL in settings first.`,
          )
        }
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainIdHex,
              chainName: params.name,
              rpcUrls: [params.rpcUrl],
              blockExplorerUrls: params.explorerUrl ? [params.explorerUrl] : undefined,
              nativeCurrency: params.nativeCurrency ?? { name: 'Ether', symbol: 'ETH', decimals: 18 },
            },
          ],
        })
      }
    },
    [provider],
  )

  return {
    available: Boolean(provider),
    address,
    chainId,
    connecting,
    error,
    connect,
    disconnect,
    switchChain,
  }
}
