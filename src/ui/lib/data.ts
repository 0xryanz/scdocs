import type { DocsBundle } from '../../shared/types'

declare global {
  interface Window {
    __SCDOCS_BUNDLE__?: DocsBundle
  }
}

/**
 * The bundle is normally inlined into index.html by the CLI, which makes the
 * built site work from `file://` (and lets a single .html file be shared).
 * `data.json` is the fallback, and what the dev server serves.
 */
export async function loadBundle(): Promise<DocsBundle> {
  if (window.__SCDOCS_BUNDLE__) return window.__SCDOCS_BUNDLE__

  const inline = document.getElementById('scdocs-data')
  if (inline?.textContent && inline.textContent.trim().length > 0) {
    return JSON.parse(inline.textContent) as DocsBundle
  }

  let response: Response
  try {
    response = await fetch('./data.json', { cache: 'no-store' })
  } catch {
    throw new Error(
      'Could not load data.json. If you opened the build over file://, serve it instead: scdocs serve',
    )
  }
  if (!response.ok) {
    throw new Error(
      `Could not load data.json (HTTP ${response.status}). Run "scdocs build", or use "scdocs dev".`,
    )
  }
  return (await response.json()) as DocsBundle
}
