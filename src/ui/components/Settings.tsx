import { useState } from 'react'
import type { ChainDoc, DocsBundle } from '../../shared/types'
import type { Settings } from '../lib/storage'
import { formatTime } from '../lib/format'
import { Icon } from './Icon'

interface SettingsProps {
  bundle: DocsBundle
  chain: ChainDoc
  settings: Settings
  /** The effective value (settings override, else config default). */
  expandAll: boolean
  onChange(patch: Partial<Settings>): void
  onReset(): void
  onClose(): void
}

export function SettingsDrawer({
  bundle,
  chain,
  settings,
  expandAll,
  onChange,
  onReset,
  onClose,
}: SettingsProps) {
  const [rpcDraft, setRpcDraft] = useState(settings.rpc[String(chain.chainId)] ?? '')

  const commitRpc = () => {
    const next = { ...settings.rpc }
    const trimmed = rpcDraft.trim()
    if (trimmed) next[String(chain.chainId)] = trimmed
    else delete next[String(chain.chainId)]
    onChange({ rpc: next })
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div>
            <h3>Settings</h3>
            <div className="drawer-sub">Stored in this browser only.</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose} title="Close">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="drawer-section">
          <h4>Appearance</h4>
          <div className="seg">
            {(['auto', 'dark', 'light'] as const).map((option) => (
              <button
                key={option}
                className={settings.theme === option ? 'on' : ''}
                onClick={() => onChange({ theme: option })}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <h4>Behavior</h4>
          <div className="drawer-row">
            <div className="grow">
              <div>Expand all functions</div>
              <div className="sub" style={{ fontFamily: 'var(--sans)' }}>
                Every form is open from the start — handy for testing.
              </div>
            </div>
            <button
              className={`seg`}
              style={{ padding: 2 }}
              onClick={() => onChange({ expandAll: !expandAll })}
            >
              <span style={{ padding: '3px 12px', fontSize: 12, color: expandAll ? 'var(--text)' : 'var(--text-dim)' }}>
                {expandAll ? 'on' : 'off'}
              </span>
            </button>
          </div>
        </div>

        <div className="drawer-section">
          <h4>Network — {chain.name}</h4>
          <div className="field" style={{ marginBottom: 10 }}>
            <div className="field-label">
              <span className="field-name">RPC URL</span>
              <span className="field-type">chain {chain.chainId}</span>
            </div>
            <input
              className="input"
              value={rpcDraft}
              spellCheck={false}
              placeholder={chain.rpcUrl ?? 'https://…'}
              onChange={(event) => setRpcDraft(event.target.value)}
              onBlur={commitRpc}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
              }}
            />
            <div className="field-desc">
              Leave empty to use the configured default. Reads and simulations go through this endpoint.
            </div>
          </div>

          {bundle.chains.length > 1 ? (
            <div className="drawer-row" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              <div className="grow">
                {bundle.chains.length} chains configured in <span className="mono">scdocs.config.ts</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="drawer-section">
          <h4>Build</h4>
          <div className="drawer-row">
            <div className="grow">Frameworks</div>
            <div className="sub">{bundle.frameworks.join(', ') || 'none'}</div>
          </div>
          <div className="drawer-row">
            <div className="grow">ABI hash</div>
            <div className="sub">{bundle.abiHash.slice(0, 18)}…</div>
          </div>
          <div className="drawer-row">
            <div className="grow">Generated</div>
            <div className="sub">{formatTime(bundle.generatedAt)}</div>
          </div>
          {bundle.source?.commit ? (
            <div className="drawer-row">
              <div className="grow">Commit</div>
              <div className="sub">{bundle.source.commit.slice(0, 10)}</div>
            </div>
          ) : null}
        </div>

        <div className="drawer-actions">
          <button className="btn" onClick={onReset}>
            Reset saved addresses & RPCs
          </button>
        </div>
      </div>
    </div>
  )
}
