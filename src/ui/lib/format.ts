import type { ErrorDoc, EventDoc, FunctionDoc } from '../../shared/types'

export function shortAddress(address?: string, size = 4): string {
  if (!address) return ''
  if (address.length <= 2 + size * 2) return address
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`
}

/** Characters that render as nothing but silently break naive hex checks. */
const INVISIBLE = /[\u00ad\u180e\u200b-\u200f\u2060-\u2064\ufeff]/g

/**
 * Normalise a machine-readable token (address, hex, integer) to plain ASCII.
 *
 * Input methods and clipboards are the two places bad characters come from:
 * a Chinese IME in full-width mode turns `0x…` into `０ｘ…`, and copied text
 * often carries invisible zero-width characters. NFKC folds the former back,
 * the regex drops the latter, so a visually-correct value stops being rejected
 * as "not a 20-byte address".
 */
export function normalizeToken(value: string): string {
  // Only trim the ends: silently gluing "0xab cd" into an address would hide a
  // paste mistake instead of reporting it.
  const text = value.normalize('NFKC').replace(INVISIBLE, '').trim()
  return text.startsWith('0X') ? `0x${text.slice(2)}` : text
}

export function isAddress(value: unknown): value is `0x${string}` {
  return asAddress(value) !== undefined
}

/** Like isAddress, but returns the normalised ASCII form to hand to viem. */
export function asAddress(value: unknown): `0x${string}` | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = normalizeToken(value)
  return /^0x[0-9a-fA-F]{40}$/.test(normalized) ? (normalized as `0x${string}`) : undefined
}

/** JSON.stringify throws on bigint — everything rendered as text goes through here. */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(toJsonSafe)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJsonSafe(inner)
    }
    return out
  }
  return value
}

export function prettyJson(value: unknown): string {
  const safe = toJsonSafe(value)
  if (typeof safe === 'string') return safe
  return JSON.stringify(safe, null, 2) ?? String(safe)
}

type ValueKind = 'num' | 'addr' | 'bool' | 'hex' | 'other'

export function valueKind(value: unknown, solidityType?: string): ValueKind {
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'bigint') return 'num'
  if (typeof value === 'string') {
    if (solidityType === 'address' || isAddress(value)) return 'addr'
    if (/^0x[0-9a-fA-F]*$/.test(value) && value.length > 2) return 'hex'
    if (/^-?\d+$/.test(value)) return 'num'
  }
  return 'other'
}

export function castArg(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(castArg).join(',')}]`
  if (value && typeof value === 'object') {
    return `(${Object.values(value as Record<string, unknown>).map(castArg).join(',')})`
  }
  if (typeof value === 'string') {
    // Quote strings that contain spaces or are empty so the shell/cast keeps them.
    return /\s/.test(value) || value === '' ? JSON.stringify(value) : value
  }
  return String(value)
}

export function castSignature(fn: FunctionDoc): string {
  const outputs = fn.outputs.map((output) => output.type).join(',')
  const base = outputs.length > 0 ? `${fn.signature}(${outputs})` : fn.signature
  return `'${base}'`
}

/** The DOM id FunctionCard uses, shared with the method navigation. */
export function functionAnchor(fn: FunctionDoc): string {
  return `fn-${fn.selector.slice(2)}`
}

/** DOM ids so global search can jump to an event or error row. */
export function eventAnchor(event: EventDoc): string {
  return `event-${event.topic0.slice(2)}`
}

export function errorAnchor(error: ErrorDoc): string {
  return `error-${error.selector.slice(2)}`
}

export function castCommand(
  address: string,
  fn: FunctionDoc,
  args: unknown[],
  mode: 'call' | 'send' = 'call',
): string {
  const isRead = fn.mutability === 'view' || fn.mutability === 'pure'
  const command = mode === 'send' || !isRead ? 'cast send' : 'cast call'
  const parts = [command, address, castSignature(fn), ...args.map(castArg)]
  return parts.join(' ')
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
