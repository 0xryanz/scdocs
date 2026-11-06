import { useMemo } from 'react'
import type { ContractDoc, DocsBundle } from '../../shared/types'
import { shortAddress } from '../lib/format'
import { DONATE_ADDRESS, PROJECT_REPO } from '../lib/project'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'

const REPO_LABEL = PROJECT_REPO.replace(/^https?:\/\/github\.com\//, '')

interface SidebarProps {
  bundle: DocsBundle
  activeId?: string
  activePageSlug?: string
  query: string
  onQuery(value: string): void
  onNavigate(contractId: string, anchor?: string): void
  onNavigatePage(slug: string): void
  className?: string
}

interface Match {
  contract: ContractDoc
  functions: Array<{ id: string; label: string }>
}

export function Sidebar({
  bundle,
  activeId,
  activePageSlug,
  query,
  onQuery,
  onNavigate,
  onNavigatePage,
  className,
}: SidebarProps) {
  const term = query.trim().toLowerCase()

  const matches = useMemo<Match[]>(() => {
    if (!term) return bundle.contracts.map((contract) => ({ contract, functions: [] }))
    const out: Match[] = []
    for (const contract of bundle.contracts) {
      const contractHit =
        contract.name.toLowerCase().includes(term) ||
        (contract.title ?? '').toLowerCase().includes(term) ||
        contract.file.toLowerCase().includes(term) ||
        (contract.summary ?? '').toLowerCase().includes(term)

      const functions = contract.functions
        .filter(
          (fn) =>
            fn.name.toLowerCase().includes(term) ||
            fn.signature.toLowerCase().includes(term) ||
            (fn.summary ?? '').toLowerCase().includes(term),
        )
        .map((fn) => ({ id: `fn-${fn.selector.slice(2)}`, label: fn.signature }))

      if (contractHit || functions.length > 0) out.push({ contract, functions })
    }
    return out
  }, [bundle, term])

  const pageMatches = useMemo(
    () =>
      (bundle.pages ?? []).filter(
        (page) =>
          !term ||
          page.title.toLowerCase().includes(term) ||
          (page.description ?? '').toLowerCase().includes(term),
      ),
    [bundle.pages, term],
  )

  return (
    <aside className={`sidebar${className ? ` ${className}` : ''}`}>
      <div className="sidebar-scroll">
        <div className="search-wrap">
          <span className="search-icon">
            <Icon name="search" size={13} />
          </span>
          <input
            className="search"
            value={query}
            placeholder="Search contracts & functions"
            spellCheck={false}
            onChange={(event) => onQuery(event.target.value)}
          />
          {query ? (
            <button className="search-clear" onClick={() => onQuery('')} title="Clear">
              <Icon name="x" size={12} />
            </button>
          ) : null}
        </div>

        {pageMatches.length > 0 ? (
          <>
            <div className="nav-group-label">Pages</div>
            {pageMatches.map((page) => (
              <button
                key={page.slug}
                className={`nav-item${page.slug === activePageSlug ? ' active' : ''}`}
                onClick={() => onNavigatePage(page.slug)}
                title={page.description}
              >
                <span className="nav-item-name">{page.title}</span>
              </button>
            ))}
          </>
        ) : null}

        <div className="nav-group-label">
          {term ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'Contracts'}
        </div>

        {matches.length === 0 ? (
          <div className="hint" style={{ padding: '8px' }}>
            Nothing matches “{query}”.
          </div>
        ) : null}

        {matches.map(({ contract, functions }) => (
          <div key={contract.id}>
            <button
              className={`nav-item${contract.id === activeId ? ' active' : ''}`}
              onClick={() => onNavigate(contract.id)}
              title={contract.id}
            >
              <span className="nav-item-name">{contract.name}</span>
              <span className="nav-count">{contract.functions.length}</span>
            </button>
            {functions.length > 0
              ? functions.map((fn) => (
                  <button
                    key={fn.id}
                    className="nav-item"
                    style={{ paddingLeft: 22, fontSize: 12 }}
                    onClick={() => onNavigate(contract.id, fn.id)}
                  >
                    <span className="nav-item-name mono">{fn.label}</span>
                  </button>
                ))
              : null}
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <div>
          {bundle.contracts.length} contracts · {bundle.frameworks.join(' + ') || 'no build'}
        </div>
        <div style={{ marginTop: 4 }}>abi {bundle.abiHash.slice(2, 10)}</div>
        {bundle.brand?.footer ? (
          <div style={{ marginTop: 8, color: 'var(--text-faint)' }}>{bundle.brand.footer}</div>
        ) : null}

        <div className="sidebar-project">
          <a
            className="sidebar-project-row"
            href={PROJECT_REPO}
            target="_blank"
            rel="noreferrer"
            title={PROJECT_REPO}
          >
            <Icon name="github" size={14} />
            <span className="sidebar-project-text">{REPO_LABEL}</span>
            <Icon name="external" size={11} className="sidebar-project-end" />
          </a>
          <div className="sidebar-project-row" title={DONATE_ADDRESS}>
            <Icon name="heart" size={14} />
            <span className="sidebar-project-text">Donate</span>
            <code className="mono sidebar-project-address">{shortAddress(DONATE_ADDRESS, 4)}</code>
            <CopyButton
              text={DONATE_ADDRESS}
              iconOnly
              className="sidebar-icon-btn"
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
