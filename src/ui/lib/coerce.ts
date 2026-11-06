import type { ParamDoc } from '../../shared/types'
import { normalizeToken } from './format'

/** Form state is plain strings / arrays / objects all the way down. Coercion to
 *  bigint & friends happens once, at submit time, so React state stays serialisable
 *  and a half-typed number never crashes a render. */
export type FormValue = string | FormValue[] | { [key: string]: FormValue }

export class CoerceError extends Error {
  constructor(
    public path: string,
    message: string,
  ) {
    super(`${path}: ${message}`)
    this.name = 'CoerceError'
  }
}

const FIXED_ARRAY = /\[(\d+)\]$/

function fixedSize(type: string): number | null {
  const match = FIXED_ARRAY.exec(type)
  return match ? Number(match[1]) : null
}

function tupleKeys(param: ParamDoc): string[] {
  return (param.components ?? []).map((component, i) => component.name || String(i))
}

export function initialFormValue(param: ParamDoc): FormValue {
  if (param.element) {
    const size = fixedSize(param.type)
    if (size !== null) {
      return Array.from({ length: size }, () => initialFormValue(param.element!))
    }
    return []
  }
  if (param.components) {
    const out: Record<string, FormValue> = {}
    param.components.forEach((component, i) => {
      out[component.name || String(i)] = initialFormValue(component)
    })
    return out
  }
  if (param.type === 'bool') return 'false'
  return ''
}

export function initialArgs(inputs: ParamDoc[]): FormValue[] {
  return inputs.map(initialFormValue)
}

/** Explain a rejected machine value in a way that exposes invisible mistakes. */
function received(value: string): string {
  if (value === '') return 'got an empty value'
  const length = [...value].length
  const nonAscii = /[^\x00-\x7f]/.test(value)
  return `got ${length} character${length === 1 ? '' : 's'}${nonAscii ? ' (including non-ASCII characters)' : ''}`
}

export function coerceParam(param: ParamDoc, raw: FormValue | undefined, path: string): unknown {
  const label = path || 'value'

  if (param.element) {
    if (!Array.isArray(raw)) throw new CoerceError(label, 'expected a list')
    const size = fixedSize(param.type)
    if (size !== null && raw.length !== size) {
      throw new CoerceError(label, `expected exactly ${size} item(s), got ${raw.length}`)
    }
    return raw.map((item, i) => coerceParam(param.element!, item, `${path}[${i}]`))
  }

  if (param.components) {
    const source =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, FormValue>)
        : {}
    const out: Record<string, unknown> = {}
    param.components.forEach((component, i) => {
      const key = component.name || String(i)
      out[key] = coerceParam(component, source[key], path ? `${path}.${key}` : key)
    })
    return out
  }

  const text = typeof raw === 'string' ? raw : ''
  const value = text.trim()
  const type = param.type

  if (type === 'bool') return value === 'true'

  if (type === 'string') return text

  if (type === 'address') {
    if (value === '') throw new CoerceError(label, 'is required')
    const address = normalizeToken(value)
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new CoerceError(
        label,
        `expected a 20-byte address (0x + 40 hex chars), ${received(value)}`,
      )
    }
    return address
  }

  if (type === 'function') {
    if (value === '') throw new CoerceError(label, 'is required')
    const pointer = normalizeToken(value)
    if (!/^0x[0-9a-fA-F]{48}$/.test(pointer)) {
      throw new CoerceError(
        label,
        `expected a function pointer (0x + 48 hex chars), ${received(value)}`,
      )
    }
    return pointer
  }

  const fixedBytes = /^bytes(\d+)$/.exec(type)
  if (fixedBytes) {
    if (value === '') throw new CoerceError(label, 'is required')
    const size = Number(fixedBytes[1])
    const hex = normalizeToken(value)
    if (!new RegExp(`^0x([0-9a-fA-F]{2}){${size}}$`).test(hex)) {
      throw new CoerceError(label, `expected exactly ${size} bytes of hex, ${received(value)}`)
    }
    return hex
  }

  if (type === 'bytes') {
    if (value === '') throw new CoerceError(label, 'is required')
    const hex = normalizeToken(value)
    if (!/^0x([0-9a-fA-F]{2})*$/.test(hex)) {
      throw new CoerceError(label, `expected 0x-prefixed hex with an even length, ${received(value)}`)
    }
    return hex
  }

  const uint = /^uint(\d*)$/.exec(type)
  if (uint) {
    const bits = Number(uint[1] || 256)
    const digits = normalizeToken(value)
    if (digits === '') throw new CoerceError(label, 'is required')
    if (!/^\d+$/.test(digits)) throw new CoerceError(label, 'expected an unsigned whole number')
    const big = BigInt(digits)
    if (big > (1n << BigInt(bits)) - 1n) {
      throw new CoerceError(label, `exceeds uint${bits} (max ${((1n << BigInt(bits)) - 1n).toString()})`)
    }
    return big
  }

  const int = /^int(\d*)$/.exec(type)
  if (int) {
    const bits = Number(int[1] || 256)
    const digits = normalizeToken(value)
    if (digits === '') throw new CoerceError(label, 'is required')
    if (!/^-?\d+$/.test(digits)) throw new CoerceError(label, 'expected a whole number')
    const big = BigInt(digits)
    const max = (1n << BigInt(bits - 1)) - 1n
    const min = -(1n << BigInt(bits - 1))
    if (big > max || big < min) {
      throw new CoerceError(label, `out of range for int${bits} (${min} … ${max})`)
    }
    return big
  }

  return value
}

export function coerceArgs(inputs: ParamDoc[], values: FormValue[]): unknown[] {
  return inputs.map((param, i) => {
    const name = param.name || `arg${i}`
    return coerceParam(param, values[i], name)
  })
}

export type PayableUnit = 'wei' | 'gwei' | 'eth'

/** Converts a human amount into a wei bigint. */
export function parseAmount(amount: string, unit: PayableUnit): bigint {
  const text = amount.trim()
  if (text === '') return 0n
  if (!/^\d*\.?\d+$/.test(text)) throw new Error('Amount must be a positive number')

  const [whole, fraction = ''] = text.split('.')
  const decimals = unit === 'eth' ? 18 : unit === 'gwei' ? 9 : 0
  if (fraction.length > decimals) {
    throw new Error(`Too many decimals for ${unit} (max ${decimals})`)
  }
  const padded = fraction.padEnd(decimals, '0')
  return BigInt(`${whole || '0'}${padded}`)
}

/** Quick sanity check used to paint inputs red before submit. */
export function fieldError(param: ParamDoc, raw: FormValue | undefined): string | null {
  try {
    coerceParam(param, raw, '')
    return null
  } catch (error) {
    return (error as Error).message.replace(/^value: /, '')
  }
}
