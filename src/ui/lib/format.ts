import type { FunctionDoc } from '../../shared/types'

export function shortAddress(address?: string, size = 4): string {
  if (!address) return ''
  if (address.length <= 2 + size * 2) return address
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`
}

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
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
