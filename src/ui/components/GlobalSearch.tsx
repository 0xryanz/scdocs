import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { DocsBundle } from '../../shared/types'
import {
  buildSearchIndex,
  KIND_LABELS,
  rankSearchEntries,
  termsFor,
  type SearchEntry,
} from '../lib/search'
import { Icon } from './Icon'

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '')

export function GlobalSearch({
  bundle,
  open,
  onClose,
  onNavigate,
  onNavigatePage,
}: {
  bundle: DocsBundle
  open: boolean
  onClose(): void
  onNavigate(contractId: string, anchor?: string): void
  onNavigatePage(slug: string): void
}) {
  const entries = useMemo(() => buildSearchIndex(bundle), [bundle])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => rankSearchEntries(entries, query), [entries, query])
  const terms = useMemo(() => termsFor(query), [query])
  const groups = useMemo(() => {
    // Keep the palette's overall relevance order: the group holding the best
    // match comes first, even when that means Methods above Pages.
    const ordered: Array<{ kind: SearchEntry['kind']; label: string; items: SearchEntry[] }> = []
    for (const entry of results) {
      let group = ordered.find((item) => item.kind === entry.kind)
      if (!group) {
        group = { kind: entry.kind, label: KIND_LABELS[entry.kind], items: [] }
        ordered.push(group)
      }
      group.items.push(entry)
    }
    return ordered
  }, [results])
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const choose = (entry: SearchEntry | undefined) => {
    if (!entry) return
    if (entry.kind === 'page' && entry.slug) onNavigatePage(entry.slug)
    else if (entry.contractId) onNavigate(entry.contractId, entry.anchor)
    onClose()
  }

  const move = (delta: number) => {
    if (flat.length === 0) return
    setActive((prev) => (prev + delta + flat.length) % flat.length)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(flat[active])
    }
  }

  return (
    <div className="search-backdrop" onMouseDown={onClose}>
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-input-row">
          <Icon name="search" size={16} style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search contracts, methods, events, pages…"
            aria-label="Search documentation"
            spellCheck={false}
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="search-results" ref={listRef} role="listbox" aria-label="Search results">
          {flat.length === 0 ? (
            <div className="search-empty">
              {query.trim() ? (
                <>
                  No matches for <strong>{query.trim()}</strong>
                </>
              ) : (
                'No docs loaded.'
              )}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.kind} className="search-group">
                <div className="search-group-label">{group.label}</div>
                {group.items.map((entry) => {
                  const index = flat.indexOf(entry)
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      data-index={index}
                      className={`search-result${index === active ? ' active' : ''}`}
                      onMouseMove={() => setActive(index)}
                      onClick={() => choose(entry)}
                    >
                      <span className="search-result-text">
                        <span
                          className={`search-result-title${
                            entry.kind === 'method' || entry.kind === 'event' || entry.kind === 'error'
                              ? ' mono'
                              : ''
                          }`}
                        >
                          <Highlight text={entry.title} terms={terms} />
                        </span>
                        {entry.subtitle ? (
                          <span className="search-result-sub">
                            <Highlight text={entry.subtitle} terms={terms} />
                          </span>
                        ) : null}
                      </span>
                      {entry.badge ? (
                        <span
                          className={`badge search-badge${
                            entry.badgeTone === 'read'
                              ? ' badge-read'
                              : entry.badgeTone === 'write'
                                ? ' badge-write'
                                : ''
                          }`}
                        >
                          {entry.badge}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="search-foot">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> navigate
          </span>
          <span>
            <kbd className="kbd">↵</kbd> open
          </span>
          <span>
            <kbd className="kbd">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd> toggle
          </span>
          <span className="spacer" />
          <span>
            {flat.length} result{flat.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  )
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>
  const pattern = new RegExp(
    `(${[...terms]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|')})`,
    'gi',
  )
  const set = new Set(terms)
  return (
    <>
      {text.split(pattern).map((part, index) =>
        set.has(part.toLowerCase()) ? (
          <mark key={index} className="search-hit">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
