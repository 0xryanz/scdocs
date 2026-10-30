/**
 * The documentation bundle.
 *
 * This is the one artifact the CLI emits and the site consumes. It is fully
 * self-describing: the UI needs no compiler, no ABI file, no network beyond an
 * RPC endpoint, because every ABI fragment needed to encode a call is inlined.
 */

export type Hex = `0x${string}`

export type Mutability = 'pure' | 'view' | 'nonpayable' | 'payable'

/** A JSON-Schema-shaped node, pre-computed in the CLI so the UI only renders. */
export interface SchemaNode {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  format?: string
  description?: string
  pattern?: string
  items?: SchemaNode
  minItems?: number
  maxItems?: number
  properties?: Record<string, SchemaNode>
  required?: string[]
  examples?: unknown[]
  /** The solidity type this node came from, kept for tooling/round-trips. */
  'x-sol'?: string
}

export interface ParamDoc {
  /** ABI name, or a name recovered from NatSpec `@param`. May be empty. */
  name: string
  /** Canonical solidity type, e.g. `uint256`, `(address,uint256)[]`. */
  type: string
  /** Solidity `internalType`, e.g. `contract IERC20` or `struct Foo.Bar`. */
  internalType?: string
  description?: string
  indexed?: boolean
  /** Tuple members. */
  components?: ParamDoc[]
  /** Element descriptor when this param is an array. */
  element?: ParamDoc
  schema: SchemaNode
}

export interface FunctionDoc {
  /** `${contractId}#${selector}` — unique across overloads. */
  id: string
  selector: Hex
  /** `transfer(address,uint256)` */
  signature: string
  name: string
  mutability: Mutability
  /** `@notice` */
  summary?: string
  /** `@dev` */
  description?: string
  inputs: ParamDoc[]
  outputs: ParamDoc[]
  /** `@custom:xxx` tags, prefix stripped. */
  custom: Record<string, string>
  /** True when the contract source has no NatSpec at all for this function. */
  undocumented?: boolean
  /** The exact ABI fragment, so overloads encode unambiguously. */
  abi: AbiFunction
}

export interface EventDoc {
  id: string
  signature: string
  topic0: Hex
  name: string
  summary?: string
  description?: string
  inputs: ParamDoc[]
  anonymous: boolean
  abi: AbiEvent
}

export interface ErrorDoc {
  id: string
  signature: string
  selector: Hex
  name: string
  summary?: string
  description?: string
  inputs: ParamDoc[]
  abi: AbiError
}

export interface ConstructorDoc {
  inputs: ParamDoc[]
  payable: boolean
  summary?: string
  description?: string
}

export interface ContractDoc {
  /** `${file}:${name}` */
  id: string
  name: string
  /** `@title` */
  title?: string
  /** contract-level `@notice` */
  summary?: string
  /** contract-level `@dev` */
  description?: string
  /** Source path as the compiler saw it, e.g. `src/DemoToken.sol`. */
  file: string
  abi: readonly unknown[]
  functions: FunctionDoc[]
  events: EventDoc[]
  errors: ErrorDoc[]
  constructor?: ConstructorDoc
  receive?: { payable: boolean }
  fallback?: { payable: boolean }
  custom: Record<string, string>
  /** Number of functions without any NatSpec, used to render a hint. */
  undocumentedCount: number
  /** Contract id of the implementation whose ABI documents this proxy. */
  proxyTargetId?: string
}

export interface DocsPage {
  slug: string
  title: string
  description?: string
  /** Rendered, trusted HTML (authored by the docs owner). */
  html: string
  file?: string
}

export interface DocsBrand {
  /** CSS color for links, buttons and active states. */
  color?: string
  /** Optional logo URL used in the top bar. */
  logo?: string
  /** Optional footer line shown in the sidebar. */
  footer?: string
}

export interface NativeCurrency {
  name: string
  symbol: string
  decimals: number
}

export interface ChainDoc {
  id: string
  name: string
  chainId: number
  rpcUrl?: string
  explorerUrl?: string
  testnet?: boolean
  nativeCurrency?: NativeCurrency
  /** contractId -> deployed address */
  addresses: Record<string, Hex>
  /** Config entries that did not resolve to a known contract. */
  unresolved?: string[]
}

export interface DocsBundle {
  schemaVersion: 1
  generator: { name: string; version: string }
  generatedAt: string
  frameworks: Array<'foundry' | 'hardhat'>
  /** Stable hash of all ABIs — lets you prove docs match a deployment. */
  abiHash: string
  source?: {
    repo?: string
    branch?: string
    commit?: string
    /** Path prefix inside the repo, so `src/Foo.sol` links correctly. */
    pathPrefix?: string
  }
  title: string
  description?: string
  chains: ChainDoc[]
  contracts: ContractDoc[]
  /** Authored overview / architecture pages. */
  pages?: DocsPage[]
  /** Site branding hooks. */
  brand?: DocsBrand
  ui?: { defaultChain?: string; expandAll?: boolean }
}

/* -- Minimal ABI shapes (structural, not imported from viem, for portability) -- */

export interface AbiParam {
  name?: string
  type: string
  internalType?: string
  components?: readonly AbiParam[]
  indexed?: boolean
}

export interface AbiFunction {
  type: 'function'
  name: string
  inputs: readonly AbiParam[]
  outputs: readonly AbiParam[]
  stateMutability: Mutability
}

export interface AbiEvent {
  type: 'event'
  name: string
  inputs: readonly AbiParam[]
  anonymous?: boolean
}

export interface AbiError {
  type: 'error'
  name: string
  inputs: readonly AbiParam[]
}
