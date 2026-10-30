import type { DocsPage } from '../../shared/types'

export function PageView({ page }: { page: DocsPage }) {
  return (
    <article className="doc-page">
      {page.description ? <p className="doc-page-lead">{page.description}</p> : null}
      <div dangerouslySetInnerHTML={{ __html: page.html }} />
    </article>
  )
}
