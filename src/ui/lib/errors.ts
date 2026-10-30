import { decodeAbiParameters, decodeErrorResult, type Abi } from 'viem'
import type { ErrorDoc } from '../../shared/types'

export interface DecodedError {
  kind: 'rejected' | 'reason' | 'panic' | 'custom' | 'unknown'
  title: string
  detail?: string
  error?: ErrorDoc
  args?: readonly unknown[]
  raw?: string
}

const PANIC_MESSAGES: Record<number, string> = {
  0x01: 'Assertion failed (assert)',
  0x11: 'Arithmetic overflow or underflow',
  0x12: 'Division or modulo by zero',
  0x21: 'Invalid enum value',
  0x22: 'Invalidly encoded storage byte array',
  0x31: 'pop() on an empty array',
  0x32: 'Array index out of bounds',
  0x41: 'Out of memory',
  0x51: 'Call to an uninitialised internal function',
}

/**
 * viem nests the raw revert payload several levels down, and the exact shape
 * depends on which action failed (call vs simulate vs send). Walk the cause
 * chain once and pick up every useful piece: the hex payload, the first real
 * message, and the 4-byte selector when only that survived.
 */
function collect(error: unknown): {
  data?: string
  selector?: `0x${string}`
  message?: string
} {
  let current: any = error
  let message: string | undefined
  let data: string | undefined
  let selector: `0x${string}` | undefined

  for (let depth = 0; current && depth < 14; depth++) {
    const candidate = current.data ?? current.raw
    if (!data && typeof candidate === 'string' && candidate.startsWith('0x') && candidate.length >= 10) {
      data = candidate
    }
    if (!selector && typeof current.signature === 'string' && /^0x[0-9a-fA-F]{8}$/.test(current.signature)) {
      selector = current.signature
    }
    if (!message) {
      const text = current.shortMessage ?? current.details
      if (typeof text === 'string' && text.length > 0 && !/RPC Request failed|Encoded error signature/i.test(text)) {
        message = text
      }
    }
    current = current.cause
  }

  if (!data && selector) data = selector
  return { data, selector, message: message ? cleanMessage(message) : undefined }
}

/** Strips the "execution reverted: custom error 0x…" scaffolding viem adds. */
function cleanMessage(message: string): string {
  return message
    .replace(/^execution reverted: custom error 0x[0-9a-fA-F]{8}: ?/i, '')
    .replace(/^the contract function "\w+" reverted with the following signature:\s*0x[0-9a-fA-F]{8}\s*/i, '')
    .replace(/^execution reverted: ?/i, '')
    .trim()
}

export function isUserRejection(error: unknown): boolean {
  const anyError = error as any
  if (anyError?.code === 4001 || anyError?.cause?.code === 4001) return true
  const message = String(anyError?.details ?? anyError?.message ?? '')
  return /user rejected|user denied|rejected the request|denied transaction/i.test(message)
}

export function decodeRevert(error: unknown, errors: ErrorDoc[]): DecodedError {
  if (isUserRejection(error)) {
    return { kind: 'rejected', title: 'Transaction rejected in wallet' }
  }

  const { data, message } = collect(error)

  if (data) {
    const selector = data.slice(0, 10).toLowerCase()
    const hasArgs = data.length > 10

    // Error(string)
    if (selector === '0x08c379a0' && hasArgs) {
      try {
        const [reason] = decodeAbiParameters([{ type: 'string' }], `0x${data.slice(10)}`)
        return { kind: 'reason', title: String(reason), raw: data }
      } catch {
        /* fall through */
      }
    }

    // Panic(uint256)
    if (selector === '0x4e487b71' && hasArgs) {
      try {
        const [code] = decodeAbiParameters([{ type: 'uint256' }], `0x${data.slice(10)}`)
        const numeric = Number(code)
        return {
          kind: 'panic',
          title: PANIC_MESSAGES[numeric] ?? `Panic(0x${numeric.toString(16)})`,
          detail: `Panic code 0x${numeric.toString(16)}`,
          raw: data,
        }
      } catch {
        /* fall through */
      }
    }

    const match = errors.find((item) => item.selector.toLowerCase() === selector)
    if (match) {
      if (!hasArgs) {
        return {
          kind: 'custom',
          title: match.name,
          detail: match.summary ?? match.description,
          error: match,
          raw: data,
        }
      }
      try {
        const decoded = decodeErrorResult({ abi: [match.abi] as Abi, data: data as `0x${string}` })
        return {
          kind: 'custom',
          title: match.name,
          detail: match.summary ?? match.description,
          error: match,
          args: decoded.args,
          raw: data,
        }
      } catch {
        return {
          kind: 'custom',
          title: match.name,
          detail: match.summary ?? match.description,
          error: match,
          raw: data,
        }
      }
    }

    // Unrecognised selector: still surface it, it is the only clue available.
    return {
      kind: 'unknown',
      title: message || 'Execution reverted',
      detail: 'Revert data does not match any error declared by this contract.',
      raw: data,
    }
  }

  return {
    kind: 'unknown',
    title: message || 'Call failed',
  }
}
