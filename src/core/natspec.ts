/**
 * NatSpec merging.
 *
 * `solc` splits documentation across two JSON blobs:
 *   - `userdoc`  holds `@notice` (the "what")
 *   - `devdoc`   holds `@dev` / `@title` / `@param` / `@returns` / `@custom:*`
 *
 * Both are keyed by the *typed* signature (`transfer(address,uint256)`), which
 * is what makes overloads work. Everything here is defensive: any of it may be
 * missing, and a contract with zero NatSpec must still produce a usable page.
 */

export interface MethodNatspec {
  summary?: string
  description?: string
  params: Record<string, string>
  returns: string[]
  custom: Record<string, string>
  documented: boolean
}

export interface Natspec {
  title?: string
  notice?: string
  details?: string
  custom: Record<string, string>
  methods: Record<string, MethodNatspec>
  events: Record<string, MethodNatspec>
  errors: Record<string, MethodNatspec>
  /** NatSpec on public state variables. Their getters are in the ABI, but solc
   *  keeps the prose here, keyed by variable name. */
  stateVariables: Record<string, MethodNatspec>
}

type Json = Record<string, unknown>

const EMPTY_METHOD: MethodNatspec = {
  params: {},
  returns: [],
  custom: {},
  documented: false,
}

function asObject(v: unknown): Json | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined
}

/** `custom:example` -> `example`, unwrapping the JSON-quoted value solc emits. */
function readCustom(obj: Json | undefined, into: Record<string, string>): void {
  if (!obj) return
  for (const [key, raw] of Object.entries(obj)) {
    if (!key.startsWith('custom:')) continue
    const name = key.slice('custom:'.length)
    if (typeof raw !== 'string') {
      into[name] = JSON.stringify(raw)
      continue
    }
    into[name] = unwrap(raw)
  }
}

function unwrap(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'string') return parsed
    } catch {
      return trimmed.slice(1, -1)
    }
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** `@returns` arrives either as a string or as `{ _0, _1 }` / `{ name }`. */
function normalizeReturns(raw: unknown): string[] {
  if (!raw) return []
  if (typeof raw === 'string') return [raw]
  const obj = asObject(raw)
  if (!obj) return []
  const out: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'string') continue
    const positional = /^_(\d+)$/.exec(key)
    if (positional) out[Number(positional[1])] = value
    else out.push(value)
  }
  return out
}

/** solc joins continued `///` lines with their source indentation, which shows up
 *  as runs of spaces mid-sentence. Collapse them for prose, but leave anything
 *  that looks like a code block alone. */
function tidy(text: string | undefined): string | undefined {
  if (!text) return text
  if (text.includes('```')) return text
  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

function readMethod(dev: unknown, user: unknown): MethodNatspec {
  const d = asObject(dev)
  const u = asObject(user)
  const params: Record<string, string> = Object.create(null)
  const custom: Record<string, string> = {}

  const devParams = asObject(d?.params)
  if (devParams) {
    for (const [k, v] of Object.entries(devParams)) if (typeof v === 'string') params[k] = v
  }
  readCustom(d, custom)

  const summary = tidy(typeof u?.notice === 'string' ? u.notice : undefined)
  const description = tidy(typeof d?.details === 'string' ? d.details : undefined)
  const returns = normalizeReturns(d?.returns ?? d?.return)

  const documented =
    Boolean(summary || description) || Object.keys(params).length > 0 || returns.length > 0

  return { summary, description, params, returns, custom, documented }
}

function readGroup(
  dev: unknown,
  user: unknown,
  unpack: (v: unknown) => unknown,
): Record<string, MethodNatspec> {
  // Null prototype: ABI names such as `toString` or `constructor` must not
  // resolve to Object.prototype members when used as lookup keys.
  const out: Record<string, MethodNatspec> = Object.create(null)
  const devMap = asObject(dev) ?? {}
  const userMap = asObject(user) ?? {}
  const keys = new Set([...Object.keys(devMap), ...Object.keys(userMap)])
  for (const key of keys) {
    out[key] = readMethod(unpack(devMap[key]), unpack(userMap[key]))
  }
  return out
}

/** solc emits `errors[sig]` as an array, because one signature can be
 *  documented in several contracts of the inheritance chain. */
function firstOf(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v
}

export function parseNatspec(devdocRaw: unknown, userdocRaw: unknown): Natspec {
  const devdoc = asObject(devdocRaw) ?? {}
  const userdoc = asObject(userdocRaw) ?? {}
  const custom: Record<string, string> = {}
  readCustom(devdoc, custom)

  return {
    title: typeof devdoc.title === 'string' ? devdoc.title : undefined,
    notice: tidy(typeof userdoc.notice === 'string' ? userdoc.notice : undefined),
    details: tidy(typeof devdoc.details === 'string' ? devdoc.details : undefined),
    custom,
    methods: readGroup(devdoc.methods, userdoc.methods, (v) => v),
    events: readGroup(devdoc.events, userdoc.events, (v) => v),
    errors: readGroup(devdoc.errors, userdoc.errors, firstOf),
    stateVariables: readGroup(devdoc.stateVariables, undefined, (v) => v),
  }
}

export function emptyMethod(): MethodNatspec {
  return { params: {}, returns: [], custom: {}, documented: false }
}

/** Later fields win only where `primary` has nothing to say. */
export function mergeMethods(primary: MethodNatspec, secondary: MethodNatspec): MethodNatspec {
  return {
    summary: primary.summary ?? secondary.summary,
    description: primary.description ?? secondary.description,
    params: Object.assign(Object.create(null), secondary.params, primary.params),
    returns: primary.returns?.length > 0 ? primary.returns : (secondary.returns ?? []),
    custom: { ...secondary.custom, ...primary.custom },
    documented: primary.documented || secondary.documented,
  }
}

export function methodNatspec(ns: Natspec, signature: string): MethodNatspec {
  return ns.methods[signature] ?? EMPTY_METHOD
}

export function eventNatspec(ns: Natspec, signature: string): MethodNatspec {
  return ns.events[signature] ?? EMPTY_METHOD
}

export function errorNatspec(ns: Natspec, signature: string): MethodNatspec {
  return ns.errors[signature] ?? EMPTY_METHOD
}
