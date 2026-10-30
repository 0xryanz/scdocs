import { keccak256, toHex } from 'viem'
import type { AbiParam, Hex } from '../shared/types.js'

/** Canonical type: expands `tuple` into its parenthesised component list. */
export function canonicalType(p: AbiParam): string {
  if (p.type.startsWith('tuple')) {
    const inner = (p.components ?? []).map(canonicalType).join(',')
    return `(${inner})${p.type.slice('tuple'.length)}`
  }
  return p.type
}

export function signatureOf(item: {
  name?: string
  inputs?: readonly AbiParam[]
}): string {
  const inputs = item.inputs ?? []
  return `${item.name ?? ''}(${inputs.map(canonicalType).join(',')})`
}

export function selectorOf(signature: string): Hex {
  return keccak256(toHex(signature)).slice(0, 10) as Hex
}

export function topic0Of(signature: string): Hex {
  return keccak256(toHex(signature))
}

const isArray = /^(.+)\[(\d*)\]$/

/** A short human description of a solidity type, used when NatSpec has none. */
export function describeType(type: string): string {
  const arr = isArray.exec(type)
  if (arr) {
    const [, inner, size] = arr
    return size ? `Fixed array of ${size} × ${describeType(inner)}` : `Array of ${describeType(inner)}`
  }
  if (type.startsWith('(')) return 'Struct'
  if (type === 'address') return 'EVM address (20 bytes, 0x-prefixed)'
  if (type === 'bool') return 'Boolean (true / false)'
  if (type === 'string') return 'UTF-8 string'
  if (type === 'bytes') return 'Dynamic bytes (0x-prefixed hex)'
  if (type === 'function') return 'External function pointer (24 bytes)'
  const bytesN = /^bytes(\d+)$/.exec(type)
  if (bytesN) return `Fixed ${bytesN[1]} bytes (0x-prefixed hex)`
  const uint = /^uint(\d*)$/.exec(type)
  if (uint) return `Unsigned integer, ${uint[1] || '256'} bits`
  const int = /^int(\d*)$/.exec(type)
  if (int) return `Signed integer, ${int[1] || '256'} bits`
  return type
}

export function arrayInfo(type: string): { inner: string; size: number | null } | null {
  const m = isArray.exec(type)
  if (!m) return null
  return { inner: m[1], size: m[2] ? Number(m[2]) : null }
}

export function isNumericType(type: string): boolean {
  return /^u?int\d*$/.test(type)
}
