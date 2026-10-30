import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ContractDoc, ErrorDoc, EventDoc, FunctionDoc } from '../../shared/types'
import { useDocs } from '../context'
import { functionAnchor, isAddress } from '../lib/format'
import { contractRoute, writeRoute } from '../lib/hash'
import { FunctionCard } from './FunctionCard'
import { Icon } from './Icon'
import { EventLogPanel } from './EventLogPanel'
import { Multicall } from './Multicall'
import { ProxyBanner } from './ProxyBanner'

export function ContractView({ contract }: { contract: ContractDoc }) {
  const ctx = useDocs()
  const reads = useMemo(
    () => contract.functions.filter((fn) => fn.mutability === 'view' || fn.mutability === 'pure'),
    [contract],
  )
  const writes = useMemo(
    () =>
      contract.functions.filter(
        (fn) => fn.mutability === 'payable' || fn.mutability === 'nonpayable',
      ),
    [contract],
  )
  const hasMethods = contract.functions.length > 0

  return (
    <div className={`contract-page${hasMethods ? ' with-nav' : ''}`}>
      <div className="contract-main">
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

        <ProxyBanner contract={contract} />

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
            <Multicall contract={contract} reads={reads} />
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
              <EventCard key={event.id} contract={contract} event={event} />
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

      {hasMethods ? <MethodNav contract={contract} reads={reads} writes={writes} /> : null}
    </div>
  )
}

const METHOD_SCROLL_OFFSET = 76

function MethodNav({
  contract,
  reads,
  writes,
}: {
  contract: ContractDoc
  reads: FunctionDoc[]
  writes: FunctionDoc[]
}) {
  const methods = useMemo(() => [...reads, ...writes], [reads, writes])
  const [active, setActive] = useState<string | undefined>()
  const suppressed = useRef(false)
  const scrollFrame = useRef<number | null>(null)
  const animationFrame = useRef<number | null>(null)
  const animationToken = useRef(0)

  const updateActive = useCallback(() => {
    const threshold = METHOD_SCROLL_OFFSET + 8
    const atBottom =
      document.documentElement.scrollHeight > window.innerHeight + 8 &&
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4

    let current: string | undefined
    if (atBottom) {
      current = functionAnchor(methods[methods.length - 1])
    } else {
      for (const fn of methods) {
        const element = document.getElementById(functionAnchor(fn))
        if (element && element.getBoundingClientRect().top <= threshold) current = functionAnchor(fn)
      }
    }
    setActive(current)
  }, [methods])

  useEffect(() => {
    if (methods.length === 0) return

    // Batch scroll reads to one layout pass per frame.
    const scheduleUpdate = () => {
      if (suppressed.current || scrollFrame.current !== null) return
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = null
        updateActive()
      })
    }

    const cancelAnimation = () => {
      if (animationFrame.current === null) return
      cancelAnimationFrame(animationFrame.current)
      animationFrame.current = null
      animationToken.current += 1
      suppressed.current = false
    }

    updateActive()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('wheel', cancelAnimation, { passive: true })
    window.addEventListener('touchstart', cancelAnimation, { passive: true })
    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('wheel', cancelAnimation)
      window.removeEventListener('touchstart', cancelAnimation)
      animationToken.current += 1
      suppressed.current = false
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current)
      scrollFrame.current = null
      animationFrame.current = null
    }
  }, [methods.length, updateActive])

  function jump(fn: FunctionDoc) {
    const id = functionAnchor(fn)
    const element = document.getElementById(id)
    if (!element) return

    // Pin the highlight immediately; scroll updates stay suppressed for the whole
    // animation so it never flickers through every method on the way down.
    setActive(id)
    writeRoute(contractRoute(contract.id, id), 'replace')
    window.dispatchEvent(new CustomEvent('scdocs:open-function', { detail: id }))

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    const destination = Math.max(
      0,
      Math.min(element.getBoundingClientRect().top + window.scrollY - METHOD_SCROLL_OFFSET, maxScroll),
    )
    const start = window.scrollY
    const distance = destination - start

    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current)
    animationFrame.current = null
    animationToken.current += 1
    const token = animationToken.current

    const finish = () => {
      window.scrollTo(0, destination)
      suppressed.current = false
      updateActive()
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (Math.abs(distance) < 2 || reducedMotion) {
      finish()
      return
    }

    suppressed.current = true
    const startedAt = performance.now()
    // Cap the duration so a jump across hundreds of methods does not crawl.
    const duration = Math.min(650, Math.max(260, Math.abs(distance) * 0.12))
    const step = (now: number) => {
      if (token !== animationToken.current) return
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased =
        progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
      window.scrollTo(0, start + distance * eased)
      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(step)
        return
      }
      animationFrame.current = null
      finish()
    }
    animationFrame.current = requestAnimationFrame(step)
  }

  return (
    <nav className="method-nav" aria-label="Contract methods">
      <div className="method-nav-title">
        <span>Methods</span>
        <span className="badge">{methods.length}</span>
      </div>
      <MethodGroup label="Read" tone="read" items={reads} active={active} onJump={jump} />
      <MethodGroup label="Write" tone="write" items={writes} active={active} onJump={jump} />
    </nav>
  )
}

function MethodGroup({
  label,
  tone,
  items,
  active,
  onJump,
}: {
  label: string
  tone: 'read' | 'write'
  items: FunctionDoc[]
  active?: string
  onJump(fn: FunctionDoc): void
}) {
  if (items.length === 0) return null
  const seen = new Set<string>()
  const overloaded = new Set<string>()
  for (const fn of items) {
    if (seen.has(fn.name)) overloaded.add(fn.name)
    seen.add(fn.name)
  }
  return (
    <div className="method-nav-group">
      <div className="method-nav-label">
        <span className={`dot ${tone}`} />
        <span>{label}</span>
        <span className="count">{items.length}</span>
      </div>
      {items.map((fn) => (
        <button
          key={fn.id}
          type="button"
          className={`method-nav-link${active === functionAnchor(fn) ? ' active' : ''}`}
          aria-current={active === functionAnchor(fn) ? 'true' : undefined}
          title={fn.signature}
          onClick={() => onJump(fn)}
        >
          <span className="nm">{overloaded.has(fn.name) ? fn.signature : fn.name}</span>
        </button>
      ))}
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

function EventCard({ contract, event }: { contract: ContractDoc; event: EventDoc }) {
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
      <EventLogPanel contract={contract} event={event} />
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
