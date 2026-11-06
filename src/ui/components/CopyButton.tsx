import { useState, type MouseEvent } from 'react'
import { Icon } from './Icon'

export function CopyButton({
  text,
  label,
  className = 'btn btn-ghost btn-sm',
  iconOnly = false,
}: {
  text: string
  label?: string
  className?: string
  /** Icon-only affordance, for tight layouts such as the sidebar footer. */
  iconOnly?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const ok = await copyText(text)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button
      type="button"
      className={className}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy'}
      onClick={copy}
    >
      <Icon name={copied ? 'check' : 'copy'} size={12} />
      {iconOnly ? null : copied ? 'copied' : (label ?? 'copy')}
    </button>
  )
}

/**
 * Clipboard API needs a secure context, which a docs folder opened over
 * `file://` is not in every browser. The textarea fallback keeps every copy
 * button working in the single-file build too.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.top = '-1000px'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}
