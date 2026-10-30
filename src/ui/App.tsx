import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ContractDoc, DocsBundle, Hex } from '../shared/types'
import { DocsContext, type DocsContextValue } from './context'
import { ContractView } from './components/ContractView'
import { Icon } from './components/Icon'
import { SettingsDrawer } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { getInjectedProvider, useWallet } from './lib/wallet'
import { makePublicClient, makeWalletClient } from './lib/clients'
import { initialChainKey, resolveChain, resolveExplorer, resolveRpc } from './lib/chains'
import { loadBundle } from './lib/data'
import { isAddress } from './lib/format'
import { addressKey, loadSettings, saveSettings, type Settings } from './lib/storage'

interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

export function App() {
  const [bundle, setBundle] = useState<DocsBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadBundle()
      .then((loaded) => {
        if (!cancelled) setBundle(loaded)
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="center-screen">
        <div className="loading-card">
          <h2>Docs could not load</h2>
          <p style={{ color: 'var(--text-dim)' }}>{error}</p>
          <pre className="raw" style={{ marginTop: 16, color: 'var(--text-faint)' }}>
            forge build && scdocs build
          </pre>
        </div>
      </div>
    )
  }

  if (!bundle) {
    return (
      <div className="center-screen">
        <div className="loading-card">
          <div className="spinner" style={{ margin: '0 auto 12px', width: 18, height: 18 }} />
          <div style={{ color: 'var(--text-dim)' }}>Loading contract docs…</div>
        </div>
      </div>
    )
  }

  return <DocsApp bundle={bundle} />
}

function DocsApp({ bundle }: { bundle: DocsBundle }) {
  const wallet = useWallet()
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | undefined>(bundle.contracts[0]?.id)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const chainKey = initialChainKey(bundle, settings.chainKey)
  const chain = useMemo(() => resolveChain(bundle, chainKey), [bundle, chainKey])
  const rpcUrl = resolveRpc(chain, settings.rpc)
  const explorer = resolveExplorer(chain, settings.rpc)

  const chainMismatch = Boolean(
    wallet.address && wallet.chainId !== undefined && wallet.chainId !== chain.chainId,
  )

  const injected = useMemo(() => getInjectedProvider(), [])

  const publicClient = useMemo(
    () => makePublicClient(chain, rpcUrl, wallet.address && !chainMismatch ? injected : undefined),
    [chain, rpcUrl, wallet.address, chainMismatch, injected],
  )

  const walletClient = useMemo(
    () =>
      wallet.address && !chainMismatch && injected
        ? makeWalletClient(chain, rpcUrl, injected, wallet.address)
        : null,
    [wallet.address, chainMismatch, injected, chain, rpcUrl],
  )

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    document.title = bundle.title
  }, [bundle.title])

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  const notify = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, kind }])
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4200)
  }, [])

  const addressFor = useCallback(
    (contract: ContractDoc): Hex | undefined => {
      const override = settings.addresses[addressKey(chain.chainId, contract.id)]
      const value = override ?? chain.addresses[contract.id]
      return isAddress(value) ? value : undefined
    },
    [settings.addresses, chain],
  )

  const savedAddressFor = useCallback(
    (contract: ContractDoc): Hex | undefined => {
      const override = settings.addresses[addressKey(chain.chainId, contract.id)]
      return isAddress(override) ? override : undefined
    },
    [settings.addresses, chain.chainId],
  )

  const setAddressFor = useCallback(
    (contractId: string, address: string) => {
      setSettings((prev) => {
        const key = addressKey(chain.chainId, contractId)
        const next = { ...prev.addresses }
        if (address.trim() === '') delete next[key]
        else next[key] = address.trim()
        return { ...prev, addresses: next }
      })
    },
    [chain.chainId],
  )

  const switchWalletChain = useCallback(() => {
    void wallet
      .switchChain({
        chainId: chain.chainId,
        name: chain.name,
        rpcUrl,
        explorerUrl: explorer,
        nativeCurrency: chain.nativeCurrency,
      })
      .catch((caught: Error) => notify(caught.message, 'error'))
  }, [wallet, chain, rpcUrl, explorer, notify])

  const navigate = useCallback((contractId: string, anchor?: string) => {
    setActiveId(contractId)
    setSidebarOpen(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (anchor) {
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      })
    })
  }, [])

  const expandAll = settings.expandAll ?? bundle.ui?.expandAll ?? false

  const ctx: DocsContextValue = {
    bundle,
    chain,
    rpcUrl,
    explorer,
    publicClient,
    walletClient,
    account: wallet.address,
    walletChainId: wallet.chainId,
    walletAvailable: wallet.available,
    chainMismatch,
    connect: () => void wallet.connect(),
    disconnect: wallet.disconnect,
    switchWalletChain,
    addressFor,
    savedAddressFor,
    setAddressFor,
    expandAll,
    notify,
  }

  const contract = bundle.contracts.find((item) => item.id === activeId) ?? bundle.contracts[0]

  return (
    <DocsContext.Provider value={ctx}>
      <div className="app">
        <TopBar
          bundle={bundle}
          chain={chain}
          chainKey={chainKey}
          onChainKey={(key) => setSettings((prev) => ({ ...prev, chainKey: key }))}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        <Sidebar
          bundle={bundle}
          activeId={contract?.id}
          query={query}
          onQuery={setQuery}
          onNavigate={navigate}
          className={sidebarOpen ? 'mobile-open' : undefined}
        />

        <main className="content">
          <div className="content-inner">
            {wallet.error ? (
              <div className="banner danger">
                <Icon name="alert" size={14} style={{ marginTop: 2 }} />
                <div>{wallet.error}</div>
              </div>
            ) : null}

            {!rpcUrl ? (
              <div className="banner">
                <Icon name="alert" size={14} style={{ marginTop: 2 }} />
                <div>
                  No RPC endpoint for {chain.name}. Reads are disabled until you set one.
                </div>
                <span className="spacer" />
                <button className="btn btn-sm" onClick={() => setSettingsOpen(true)}>
                  Set RPC
                </button>
              </div>
            ) : null}

            {contract ? (
              <ContractView contract={contract} />
            ) : (
              <div className="empty">
                <h3>No contracts in this build</h3>
                <p>
                  Run <code>forge build</code> or <code>npx hardhat compile</code>, then rebuild the docs.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {settingsOpen ? (
        <SettingsDrawer
          bundle={bundle}
          chain={chain}
          settings={settings}
          expandAll={expandAll}
          onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          onReset={() => {
            setSettings((prev) => ({ ...prev, addresses: {}, rpc: {} }))
            notify('Saved addresses and RPCs cleared')
          }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.kind === 'error' ? ' error' : ''}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </DocsContext.Provider>
  )
}

function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  if (theme === 'auto') {
    const prefersLight =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    root.setAttribute('data-theme', prefersLight ? 'light' : 'dark')
    return
  }
  root.setAttribute('data-theme', theme)
}
