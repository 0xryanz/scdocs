export type Route =
  | { kind: 'contract'; contractId: string; anchor?: string }
  | { kind: 'page'; slug: string }

/**
 * A tiny hash router. Contract ids contain `:` and `#`, so every segment is
 * encoded. Hash routing keeps the build deployable on any static host without
 * rewrite rules.
 */
export function readRoute(): Route | null {
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (!raw) return null

  const parts = raw.split('/')
  try {
    if (parts[0] === 'contract' && parts[1]) {
      return {
        kind: 'contract',
        contractId: decodeURIComponent(parts[1]),
        anchor: parts[2] ? decodeURIComponent(parts[2]) : undefined,
      }
    }
    if (parts[0] === 'page' && parts[1]) {
      return { kind: 'page', slug: decodeURIComponent(parts[1]) }
    }
  } catch {
    return null
  }
  return null
}

export function contractRoute(contractId: string, anchor?: string): string {
  return `#/contract/${encodeURIComponent(contractId)}${anchor ? `/${encodeURIComponent(anchor)}` : ''}`
}

export function pageRoute(slug: string): string {
  return `#/page/${encodeURIComponent(slug)}`
}

export function writeRoute(hash: string, mode: 'push' | 'replace' = 'push'): void {
  if (window.location.hash === hash) return
  if (mode === 'replace') window.history.replaceState(null, '', hash)
  else window.history.pushState(null, '', hash)
}
