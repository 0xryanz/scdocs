import type { DocsBundle } from '../../shared/types'
import { errorAnchor, eventAnchor, functionAnchor } from './format'

export type SearchKind = 'page' | 'contract' | 'method' | 'event' | 'error'

/** Group order in the palette; also the tie-breaker for equal scores. */
export const KIND_ORDER: SearchKind[] = ['page', 'contract', 'method', 'event', 'error']

export const KIND_LABELS: Record<SearchKind, string> = {
  page: 'Pages',
  contract: 'Contracts',
  method: 'Methods',
  event: 'Events',
  error: 'Errors',
}

export interface SearchEntry {
  key: string
  kind: SearchKind
  title: string
  subtitle?: string
  /** Small badge shown on the right, e.g. a method's mutability. */
  badge?: string
  badgeTone?: 'read' | 'write'
  /** Every text field that can match, pre-joined for cheap scoring. */
  haystack: string
  contractId?: string
  anchor?: string
  slug?: string
}

/**
 * Flattens the docs bundle into the entries the command palette searches.
 * Methods, events and errors keep their contract so a result can jump straight
 * to the anchor inside the right page.
 */
export function buildSearchIndex(bundle: DocsBundle): SearchEntry[] {
  const entries: SearchEntry[] = []

  for (const page of bundle.pages ?? []) {
    const body = stripHtml(page.html)
    entries.push({
      key: `page:${page.slug}`,
      kind: 'page',
      title: page.title,
      subtitle: page.description ?? page.slug,
      slug: page.slug,
      haystack: [page.title, page.description, page.slug, body].filter(Boolean).join(' '),
    })
  }

  for (const contract of bundle.contracts) {
    const contractTitle = contract.title ?? contract.name
    const contractHaystack = [
      contract.name,
      contract.title,
      contract.file,
      contract.summary,
      contract.description,
      contract.id,
    ]
      .filter(Boolean)
      .join(' ')

    entries.push({
      key: `contract:${contract.id}`,
      kind: 'contract',
      title: contractTitle,
      subtitle: contract.file,
      contractId: contract.id,
      haystack: contractHaystack,
    })

    for (const fn of contract.functions) {
      const isRead = fn.mutability === 'view' || fn.mutability === 'pure'
      entries.push({
        key: `method:${fn.id}`,
        kind: 'method',
        title: fn.signature,
        subtitle: contract.name,
        badge: fn.mutability,
        badgeTone: isRead ? 'read' : 'write',
        contractId: contract.id,
        anchor: functionAnchor(fn),
        haystack: [
          fn.name,
          fn.signature,
          fn.summary,
          fn.description,
          contract.name,
          fn.selector,
        ]
          .filter(Boolean)
          .join(' '),
      })
    }

    for (const event of contract.events) {
      entries.push({
        key: `event:${event.id}`,
        kind: 'event',
        title: event.signature,
        subtitle: contract.name,
        contractId: contract.id,
        anchor: eventAnchor(event),
        haystack: [event.name, event.signature, event.summary, event.description, contract.name]
          .filter(Boolean)
          .join(' '),
      })
    }

    for (const error of contract.errors) {
      entries.push({
        key: `error:${error.id}`,
        kind: 'error',
        title: error.signature,
        subtitle: contract.name,
        contractId: contract.id,
        anchor: errorAnchor(error),
        haystack: [error.name, error.signature, error.summary, error.description, contract.name]
          .filter(Boolean)
          .join(' '),
      })
    }
  }

  return entries
}

/**
 * Every whitespace-separated term must match. Results are ranked by how well
 * the title matches before falling back to the rest of the entry.
 */
export function rankSearchEntries(
  entries: SearchEntry[],
  rawQuery: string,
  limit = 40,
): SearchEntry[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) {
    return entries
      .filter((entry) => entry.kind === 'page' || entry.kind === 'contract')
      .slice(0, 12)
  }

  const terms = query.split(/\s+/).filter(Boolean)
  const matchers = terms.map((term) => ({
    term,
    word: new RegExp(`(^|[^a-z0-9_])${escapeRegExp(term)}([^a-z0-9_]|$)`, 'i'),
  }))
  const scored: Array<{ entry: SearchEntry; score: number }> = []

  for (const entry of entries) {
    const haystack = entry.haystack.toLowerCase()
    const title = entry.title.toLowerCase()
    let score = 0

    for (const { term, word } of matchers) {
      if (!haystack.includes(term)) {
        score = -1
        break
      }
      if (title === term) score += 100
      else if (title.startsWith(term)) score += 60
      else if (title.includes(term)) score += 30
      else score += 10

      // Prefer whole-word hits over matches buried in the middle of a token.
      if (word.test(title)) score += 15
    }

    if (score < 0) continue
    // Shorter titles are usually the more specific result.
    score -= entry.title.length * 0.01
    scored.push({ entry, score })
  }

  scored.sort(
    (a, b) => b.score - a.score || KIND_ORDER.indexOf(a.entry.kind) - KIND_ORDER.indexOf(b.entry.kind),
  )

  return scored.slice(0, limit).map((item) => item.entry)
}

export function termsFor(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
