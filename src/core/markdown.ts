/**
 * A deliberately small Markdown renderer for authored docs pages.
 *
 * It covers the pieces that matter for a protocol overview: headings,
 * paragraphs, lists, code fences, blockquotes, links and inline emphasis.
 * Raw HTML is escaped, so a page cannot inject scripts into the docs site.
 */

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.trim() === '') {
      index += 1
      continue
    }

    const fence = /^```([\w-]*)\s*$/.exec(line)
    if (fence) {
      const language = fence[1]
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      const cls = language ? ` class="language-${escapeAttr(language)}"` : ''
      out.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const text = heading[2]
      const id = slugify(text) || `section-${out.length}`
      out.push(`<h${level} id="${escapeAttr(id)}">${inline(text)}</h${level}>`)
      index += 1
      continue
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
      out.push('<hr />')
      index += 1
      continue
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`)
      continue
    }

    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
    ) {
      const headers = splitTableRow(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      const head = headers.map((cell) => `<th>${inline(cell)}</th>`).join('')
      const body = rows
        .map((row) => `<tr>${headers.map((_, cell) => `<td>${inline(row[cell] ?? '')}</td>`).join('')}</tr>`)
        .join('')
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
        index += 1
      }
      out.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      out.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`)
      continue
    }

    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length) {
      const next = lines[index]
      if (
        next.trim() === '' ||
        /^```/.test(next) ||
        /^(#{1,6})\s+/.test(next) ||
        /^\s*>/.test(next) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next)
      ) {
        break
      }
      paragraph.push(next.trim())
      index += 1
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }

  return out.join('\n')
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function inline(value: string): string {
  let text = escapeHtml(value)

  // Inline code first, so emphasis inside it is left alone.
  text = text.replace(/`([^`]+)`/g, (_match, body: string) => `<code>${body}</code>`)

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
    const safe = safeUrl(unescapeHtml(url))
    return safe ? `<a href="${escapeAttr(safe)}">${label}</a>` : label
  })

  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')

  return text
}

function safeUrl(value: string): string | undefined {
  const trimmed = value.trim()
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed
  return undefined
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
