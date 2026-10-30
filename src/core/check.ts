import type { ContractDoc, DocsBundle, FunctionDoc } from '../shared/types.js'

export interface ContractChange {
  contract: string
  added: string[]
  removed: string[]
  changed: string[]
}

export interface AbiDiff {
  contractsAdded: string[]
  contractsRemoved: string[]
  contractsChanged: ContractChange[]
}

export interface Coverage {
  contracts: number
  functions: number
  documented: number
  undocumented: number
  percent: number
}

export function coverageOf(bundle: DocsBundle): Coverage {
  const functions = bundle.contracts.reduce((sum, contract) => sum + contract.functions.length, 0)
  const undocumented = bundle.contracts.reduce(
    (sum, contract) => sum + contract.undocumentedCount,
    0,
  )
  const documented = Math.max(0, functions - undocumented)
  return {
    contracts: bundle.contracts.length,
    functions,
    documented,
    undocumented,
    percent: functions === 0 ? 100 : (documented / functions) * 100,
  }
}

export function compareBundles(previous: DocsBundle, current: DocsBundle): AbiDiff {
  const before = new Map(previous.contracts.map((contract) => [contract.id, contract]))
  const after = new Map(current.contracts.map((contract) => [contract.id, contract]))

  const contractsAdded = current.contracts
    .filter((contract) => !before.has(contract.id))
    .map((contract) => contract.name)
    .sort()
  const contractsRemoved = previous.contracts
    .filter((contract) => !after.has(contract.id))
    .map((contract) => contract.name)
    .sort()

  const contractsChanged: ContractChange[] = []
  for (const contract of current.contracts) {
    const old = before.get(contract.id)
    if (!old) continue
    const change = compareContract(contract, old)
    if (change.added.length || change.removed.length || change.changed.length) {
      contractsChanged.push(change)
    }
  }

  return { contractsAdded, contractsRemoved, contractsChanged }
}

export function hasBreakingChanges(diff: AbiDiff): boolean {
  return (
    diff.contractsRemoved.length > 0 ||
    diff.contractsChanged.some(
      (change) => change.removed.length > 0 || change.changed.length > 0,
    )
  )
}

function compareContract(current: ContractDoc, previous: ContractDoc): ContractChange {
  const oldFunctions = new Map(previous.functions.map((fn) => [fn.signature, fn]))
  const newFunctions = new Map(current.functions.map((fn) => [fn.signature, fn]))

  const added = current.functions
    .filter((fn) => !oldFunctions.has(fn.signature))
    .map((fn) => fn.signature)
  const removed = previous.functions
    .filter((fn) => !newFunctions.has(fn.signature))
    .map((fn) => fn.signature)
  const changed: string[] = []

  for (const fn of current.functions) {
    const old = oldFunctions.get(fn.signature)
    if (!old) continue
    if (functionShape(fn) !== functionShape(old)) changed.push(fn.signature)
  }

  const oldEvents = new Set(previous.events.map((event) => event.signature))
  const newEvents = new Set(current.events.map((event) => event.signature))
  for (const signature of newEvents) if (!oldEvents.has(signature)) changed.push(`event ${signature}`)
  for (const signature of oldEvents) if (!newEvents.has(signature)) changed.push(`event ${signature}`)

  const oldErrors = new Set(previous.errors.map((error) => error.signature))
  const newErrors = new Set(current.errors.map((error) => error.signature))
  for (const signature of newErrors) if (!oldErrors.has(signature)) changed.push(`error ${signature}`)
  for (const signature of oldErrors) if (!newErrors.has(signature)) changed.push(`error ${signature}`)

  return {
    contract: current.name,
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  }
}

/** Mutability and output shape are the parts not covered by the signature key. */
function functionShape(fn: FunctionDoc): string {
  return `${fn.mutability}|${fn.outputs.map((output) => output.type).join(',')}`
}
