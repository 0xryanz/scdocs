import type {
  ContractDoc,
  ErrorDoc,
  EventDoc,
  FunctionDoc,
  ParamDoc,
} from '../shared/types.js'
import { selectorOf, signatureOf, topic0Of } from './abi.js'
import { parseNatspec, mergeMethods, emptyMethod, type Natspec } from './natspec.js'
import { toParamDoc } from './schema.js'

export interface RawContract {
  file: string
  name: string
  abi: readonly any[]
  devdoc?: unknown
  userdoc?: unknown
}

/**
 * Attach `@param` descriptions to params.
 *
 * Three things make this less trivial than it looks:
 *   1. ABI names can be empty while NatSpec keeps the source names.
 *   2. Struct fields are documented as `paramName.fieldName`.
 *   3. Only some params may be documented — never shift docs onto the wrong slot.
 */
export function attachDocs(params: ParamDoc[], docs: Record<string, string> | undefined): void {
  if (!docs) return
  const keys = Object.keys(docs)
  if (keys.length === 0) return

  for (const p of params) {
    if (p.name && docs[p.name] !== undefined) p.description = docs[p.name]
  }

  if (params.length > 0 && params.every((p) => !p.name)) {
    // Names were stripped: recover them positionally, which is exact because
    // solc emits `@param` in declaration order.
    params.forEach((p, i) => {
      const key = keys[i]
      if (key === undefined) return
      p.name = key
      p.description = docs[key]
    })
  }

  for (const p of params) {
    const nested = pickPrefixed(docs, p.name)
    if (!nested) continue
    if (p.components?.length) attachDocs(p.components, nested)
    else if (p.element?.components?.length) attachDocs(p.element.components, nested)
  }
}

function pickPrefixed(docs: Record<string, string>, prefix: string): Record<string, string> | undefined {
  if (!prefix) return undefined
  const out: Record<string, string> = {}
  const head = `${prefix}.`
  for (const [k, v] of Object.entries(docs)) {
    if (k.startsWith(head)) out[k.slice(head.length)] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function applyReturnDocs(outputs: ParamDoc[], returns: string[]): void {
  outputs.forEach((p, i) => {
    if (returns[i]) p.description = returns[i]
  })
}

const READ_FIRST = { pure: 0, view: 0, nonpayable: 1, payable: 2 } as const

export function normalizeContract(raw: RawContract): ContractDoc {
  const ns: Natspec = parseNatspec(raw.devdoc, raw.userdoc)
  const contractId = `${raw.file}:${raw.name}`

  const functions: FunctionDoc[] = []
  const events: EventDoc[] = []
  const errors: ErrorDoc[] = []
  let constructorDoc: ContractDoc['constructor']
  let receive: ContractDoc['receive']
  let fallback: ContractDoc['fallback']

  for (const item of raw.abi as any[]) {
    if (!item || typeof item !== 'object') continue

    if (item.type === 'function') {
      const signature = signatureOf(item)
      const selector = selectorOf(signature)
      const fromMethods = ns.methods[signature]
      // A public state variable's getter has its prose under `stateVariables`.
      const fromStateVar = ns.stateVariables[item.name]
      const spec = fromStateVar
        ? mergeMethods(fromMethods ?? emptyMethod(), fromStateVar)
        : fromMethods
      const inputs = (item.inputs ?? []).map(toParamDoc)
      const outputs = (item.outputs ?? []).map(toParamDoc)
      if (spec) {
        attachDocs(inputs, spec.params)
        applyReturnDocs(outputs, spec.returns)
      }
      functions.push({
        id: `${contractId}#${selector}`,
        selector,
        signature,
        name: item.name,
        mutability: item.stateMutability ?? 'nonpayable',
        summary: spec?.summary,
        description: spec?.description,
        inputs,
        outputs,
        custom: spec?.custom ?? {},
        undocumented: !spec?.documented,
        abi: item,
      })
      continue
    }

    if (item.type === 'event') {
      const signature = signatureOf(item)
      const spec = ns.events[signature]
      const inputs = (item.inputs ?? []).map(toParamDoc)
      if (spec) attachDocs(inputs, spec.params)
      events.push({
        id: `${contractId}#${signature}`,
        signature,
        topic0: topic0Of(signature),
        name: item.name,
        summary: spec?.summary,
        description: spec?.description,
        inputs,
        anonymous: Boolean(item.anonymous),
        abi: item,
      })
      continue
    }

    if (item.type === 'error') {
      const signature = signatureOf(item)
      const spec = ns.errors[signature]
      const inputs = (item.inputs ?? []).map(toParamDoc)
      if (spec) attachDocs(inputs, spec.params)
      errors.push({
        id: `${contractId}#${selectorOf(signature)}`,
        signature,
        selector: selectorOf(signature),
        name: item.name,
        summary: spec?.summary,
        description: spec?.description,
        inputs,
        abi: item,
      })
      continue
    }

    if (item.type === 'constructor') {
      const spec = ns.methods['constructor'] ?? ns.methods['']
      const inputs = (item.inputs ?? []).map(toParamDoc)
      if (spec) attachDocs(inputs, spec.params)
      constructorDoc = {
        inputs,
        payable: item.stateMutability === 'payable',
        summary: spec?.summary,
        description: spec?.description,
      }
      continue
    }

    if (item.type === 'receive') {
      receive = { payable: item.stateMutability === 'payable' }
      continue
    }

    if (item.type === 'fallback') {
      fallback = { payable: item.stateMutability === 'payable' }
    }
  }

  // Stable sort: read-only calls first, then state-changing ones, source order kept.
  functions.sort((a, b) => READ_FIRST[a.mutability] - READ_FIRST[b.mutability])

  return {
    id: contractId,
    name: raw.name,
    title: ns.title,
    summary: ns.notice,
    description: ns.details,
    file: raw.file,
    abi: raw.abi,
    functions,
    events,
    errors,
    constructor: constructorDoc,
    receive,
    fallback,
    custom: ns.custom,
    undocumentedCount: functions.filter((f) => f.undocumented).length,
  }
}
