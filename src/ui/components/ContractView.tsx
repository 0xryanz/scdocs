import { useEffect, useState } from 'react'
import type { ContractDoc, ErrorDoc, EventDoc } from '../../shared/types'
import { useDocs } from '../context'
import { isAddress } from '../lib/format'
import { FunctionCard } from './FunctionCard'
import { Icon } from './Icon'

export function ContractView({ contract }: { contract: ContractDoc }) {
  const ctx = useDocs()
  const reads = contract.functions.filter((fn) => fn.mutability === 'view' || fn.mutability === 'pure')
  const writes = contract.functions.filter((fn) => fn.mutability === 'payable' || fn.mutability === 'nonpayable')

  return (
    <div>
      <header className="contract-head">
        <div className="contract-title-row">
          <h1 className="contract-name">{contract.title ?? contract.name}</h1>
          {contract.title && contract.title !== contract.name ? (
            <span className="badge">{contract.name}</span>
          ) : null}
          <a
            className="contract-file"
            href={sourceUrl(contract, ctx.bundle.source)}
            target="_blank"
            rel="noreferrer"
            title={sourceUrl(contract, ctx.bundle.source) ? 'Open source' : contract.file}
          >
            {contract.file}
          </a>
        </div>

        {contract.summary ? <p className="contract-summary">{contract.summary}</p> : null}
        {contract.description ? <p className="contract-dev">{contract.description}</p> : null}
        {Object.entries(contract.custom).length > 0 ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {Object.entries(contract.custom).map(([key, value]) => (
              <span className="badge badge-custom" key={key} title={value}>
                {key}
              </span>
            ))}
          </div>
        ) : null}

        <AddressBar contract={contract} />
      </header>

      {ctx.chainMismatch && writes.length > 0 ? (
        <div className="banner">
          <Icon name="alert" size={14} style={{ marginTop: 2 }} />
          <div>
            Your wallet is on chain <strong>{ctx.walletChainId ?? 'unknown'}</strong>, but these docs target{' '}
            <strong>{ctx.chain.name}</strong> ({ctx.chain.chainId}). Reads still work; writes will ask you to switch.
          </div>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => ctx.switchWalletChain()}>
            Switch
          </button>
        </div>
      ) : null}

      {contract.undocumentedCount > 0 ? (
        <div className="banner">
          <Icon name="book" size={14} style={{ marginTop: 2 }} />
          <div>
            {contract.undocumentedCount}{' '}
            {contract.undocumentedCount === 1 ? 'function has' : 'functions have'} no NatSpec. They are listed
            with type hints instead. Add <code>/// @notice</code> + <code>/// @param</code> to fill the gaps.
          </div>
        </div>
      ) : null}

      {reads.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Read</h2>
            <span className="badge badge-read">{reads.length}</span>
            <span className="rule" />
          </div>
          {reads.map((fn) => (
            <FunctionCard key={fn.id} contract={contract} fn={fn} />
          ))}
        </section>
      ) : null}

      {writes.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Write</h2>
            <span className="badge badge-write">{writes.length}</span>
            <span className="rule" />
            <span className="hint">simulated before signing</span>
          </div>
          {writes.map((fn) => (
            <FunctionCard key={fn.id} contract={contract} fn={fn} />
          ))}
        </section>
      ) : null}

      {contract.events.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Events</h2>
            <span className="badge">{contract.events.length}</span>
            <span className="rule" />
          </div>
          {contract.events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </section>
      ) : null}

      {contract.errors.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Errors</h2>
            <span className="badge">{contract.errors.length}</span>
            <span className="rule" />
          </div>
          {contract.errors.map((error) => (
            <ErrorRow key={error.id} error={error} />
          ))}
        </section>
      ) : null}

      {contract.functions.length === 0 ? (
        <div className="empty">
          <h3>No external functions</h3>
          <p>This contract exposes no ABI functions — it may be an interface or a library.</p>
        </div>
      ) : null}
    </div>
  )
}

function sourceUrl(
  contract: ContractDoc,
  source: { repo?: string; branch?: string; commit?: string; pathPrefix?: string } | undefined,
): string | undefined {
  if (!source?.repo) return undefined
  const branch = source.commit ?? source.branch ?? 'main'
  const prefix = source.pathPrefix ?? ''
  const path = `${prefix}${contract.file}`.replace(/\/+/g, '/').replace(/^\//, '')
  return `${source.repo.replace(/\/$/, '')}/blob/${branch}/${path}`
}

function AddressBar({ contract }: { contract: ContractDoc }) {
  const ctx = useDocs()
  const resolved = ctx.addressFor(contract)
  const saved = ctx.savedAddressFor(contract)
  const [draft, setDraft] = useState(resolved ?? '')

  useEffect(() => {
    setDraft(resolved ?? '')
  }, [resolved])

  const trimmed = draft.trim()
  const valid = trimmed === '' || isAddress(trimmed)
  const dirty = trimmed !== (resolved ?? '')

  const commit = () => {
    if (!valid) return
    if (trimmed === (resolved ?? '')) return
    ctx.setAddressFor(contract.id, trimmed)
  }

  return (
    <div className="address-bar">
      <label htmlFor={`addr-${contract.id}`}>Address</label>
      <input
        id={`addr-${contract.id}`}
        className={`address-input${valid ? '' : ' invalid'}`}
        value={draft}
        spellCheck={false}
        placeholder={
          ctx.chain.addresses[contract.id]
            ? 'address for this chain'
            : 'no address configured — paste a deployed address'
        }
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        }}
      />
      {resolved && ctx.explorer ? (
        <a
          className="btn btn-sm"
          href={`${ctx.explorer}/address/${resolved}`}
          target="_blank"
          rel="noreferrer"
          title="Open in explorer"
        >
          <Icon name="external" size={12} />
        </a>
      ) : null}
      {saved ? (
        <button className="btn btn-ghost btn-sm" onClick={() => ctx.setAddressFor(contract.id, '')}>
          Reset to config
        </button>
      ) : null}
      {dirty && valid ? (
        <span className="hint">press Enter to apply</span>
      ) : null}
    </div>
  )
}

function EventCard({ event }: { event: EventDoc }) {
  return (
    <div className="event">
      <div className="event-sig">
        <span className="ev-name">{event.name}</span>
        <span className="fn-paren">(</span>
        {event.inputs.map((input, index) => (
          <span key={index}>
            {index > 0 ? ', ' : ''}
            <span className="fn-type">{input.type}</span>
            {input.indexed ? <span className="idx"> indexed</span> : null}
            {input.name ? <span className="fn-args"> {input.name}</span> : null}
          </span>
        ))}
        <span className="fn-paren">)</span>
      </div>
      {event.summary ? <div className="event-doc">{event.summary}</div> : null}
      {event.description ? <div className="event-doc" style={{ color: 'var(--text-faint)' }}>{event.description}</div> : null}
      {event.inputs.some((input) => input.description) ? (
        <div className="event-doc">
          {event.inputs
            .filter((input) => input.description)
            .map((input) => (
              <div key={input.name || input.type}>
                <span className="out-name">{input.name || input.type}</span> — {input.description}
              </div>
            ))}
        </div>
      ) : null}
      <div className="event-topic">topic0 {event.topic0}</div>
    </div>
  )
}

function ErrorRow({ error }: { error: ErrorDoc }) {
  return (
    <div className="event">
      <div className="event-sig">
        <span className="ev-name" style={{ color: 'var(--danger)' }}>
          {error.name}
        </span>
        <span className="fn-paren">(</span>
        {error.inputs.map((input, index) => (
          <span key={index}>
            {index > 0 ? ', ' : ''}
            <span className="fn-type">{input.type}</span>
            {input.name ? <span className="fn-args"> {input.name}</span> : null}
          </span>
        ))}
        <span className="fn-paren">)</span>
      </div>
      {error.summary ? <div className="event-doc">{error.summary}</div> : null}
      {error.inputs.some((input) => input.description) ? (
        <div className="event-doc">
          {error.inputs
            .filter((input) => input.description)
            .map((input) => (
              <div key={input.name || input.type}>
                <span className="out-name">{input.name || input.type}</span> — {input.description}
              </div>
            ))}
        </div>
      ) : null}
      <div className="event-topic">selector {error.selector}</div>
    </div>
  )
}
