import { useEffect, useRef, useState } from 'react'
import type { ChainDoc, DocsBundle } from '../../shared/types'
import { useDocs } from '../context'
import { shortAddress } from '../lib/format'
import { BUILTINS } from '../lib/chains'
import { Icon } from './Icon'

interface TopBarProps {
  bundle: DocsBundle
  chain: ChainDoc
  chainKey: string
  onChainKey(key: string): void
  onOpenSettings(): void
  onToggleSidebar(): void
}

export function TopBar({ bundle, chain, chainKey, onChainKey, onOpenSettings, onToggleSidebar }: TopBarProps) {
  const ctx = useDocs()
  const [chainMenu, setChainMenu] = useState(false)
  const [walletMenu, setWalletMenu] = useState(false)
  const chainRef = useRef<HTMLDivElement>(null)
  const walletRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chainMenu && !walletMenu) return
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (chainRef.current?.contains(target)) return
      if (walletRef.current?.contains(target)) return
      setChainMenu(false)
      setWalletMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [chainMenu, walletMenu])

  const configuredIds = new Set(bundle.chains.map((item) => item.chainId))
  const extraChains = BUILTINS.filter((item) => !configuredIds.has(item.chainId))

  return (
    <header className="topbar">
      <button className="btn btn-ghost mobile-only" onClick={onToggleSidebar} title="Contracts">
        <Icon name="menu" size={16} />
      </button>

      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-name">{bundle.title}</div>
      </div>

      <div className="topbar-spacer" />

      <div className="popover-anchor" ref={chainRef}>
        <button className="btn btn-chain" onClick={() => setChainMenu((prev) => !prev)} title="Select chain">
          <span className={`chain-dot${chain.testnet ? ' testnet' : ''}`} />
          <span>{chain.name}</span>
          <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 11 }}>
            {chain.chainId}
          </span>
          <Icon name="down" size={12} />
        </button>

        {chainMenu ? (
          <div className="menu">
            {bundle.chains.length > 0 ? (
              <>
                <div className="menu-label">Configured</div>
                {bundle.chains.map((item) => (
                  <button
                    key={item.id}
                    className={`menu-item${item.id === chainKey ? ' selected' : ''}`}
                    onClick={() => {
                      onChainKey(item.id)
                      setChainMenu(false)
                    }}
                  >
                    <span className={`chain-dot${item.testnet ? ' testnet' : ''}`} />
                    <span>{item.name}</span>
                    <span className="sub">{item.chainId}</span>
                  </button>
                ))}
                {extraChains.length > 0 ? <div className="menu-sep" /> : null}
              </>
            ) : null}

            {extraChains.length > 0 ? (
              <div className="menu-label">Public networks</div>
            ) : null}
            {extraChains.map((item) => (
              <button
                key={item.chainId}
                className={`menu-item${`builtin:${item.chainId}` === chainKey ? ' selected' : ''}`}
                onClick={() => {
                  onChainKey(`builtin:${item.chainId}`)
                  setChainMenu(false)
                }}
              >
                <span className={`chain-dot${item.testnet ? ' testnet' : ''}`} />
                <span>{item.name}</span>
                <span className="sub">{item.chainId}</span>
              </button>
            ))}

            <div className="menu-sep" />
            <a
              className="menu-item"
              href="https://chainlist.org"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--text-dim)', fontSize: 12 }}
            >
              <Icon name="external" size={12} />
              <span>Add chains in scdocs.config.ts</span>
            </a>
          </div>
        ) : null}
      </div>

      <div className="popover-anchor" ref={walletRef}>
        {ctx.account ? (
          <button className="btn" onClick={() => setWalletMenu((prev) => !prev)} title={ctx.account}>
            <span className={`chain-dot${ctx.chainMismatch ? ' testnet' : ''}`} />
            <span className="mono">{shortAddress(ctx.account)}</span>
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => ctx.connect()} disabled={!ctx.walletAvailable}>
            <Icon name="wallet" size={13} />
            {ctx.walletAvailable ? 'Connect wallet' : 'No wallet'}
          </button>
        )}

        {walletMenu && ctx.account ? (
          <div className="menu" style={{ minWidth: 240 }}>
            <div className="menu-label">Connected</div>
            <div className="menu-item" style={{ cursor: 'default' }}>
              <span className="mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
                {ctx.account}
              </span>
            </div>
            <div className="menu-item" style={{ cursor: 'default' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>wallet chain</span>
              <span className="sub">{ctx.walletChainId ?? 'unknown'}</span>
            </div>
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ctx.account ?? '')
                  ctx.notify('Address copied')
                } catch {
                  ctx.notify('Clipboard blocked', 'error')
                }
              }}
            >
              <Icon name="copy" size={12} />
              <span>Copy address</span>
            </button>
            {ctx.chainMismatch ? (
              <button
                className="menu-item"
                onClick={() => {
                  ctx.switchWalletChain()
                  setWalletMenu(false)
                }}
              >
                <Icon name="sliders" size={12} />
                <span>Switch to {chain.name}</span>
              </button>
            ) : null}
            <button
              className="menu-item"
              onClick={() => {
                ctx.disconnect()
                setWalletMenu(false)
              }}
            >
              <Icon name="x" size={12} />
              <span>Disconnect</span>
            </button>
          </div>
        ) : null}
      </div>

      <button className="btn btn-ghost" onClick={onOpenSettings} title="Settings">
        <Icon name="sliders" size={15} />
      </button>
    </header>
  )
}
