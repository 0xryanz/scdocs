import type { ChainDoc, ContractDoc, FunctionDoc, ParamDoc } from '../../shared/types'
import { coerceParam, type FormValue } from './coerce'

/** A TypeScript snippet, one per framework, for a single contract function. */
export type ExampleFramework = 'viem' | 'ethers' | 'wagmi' | 'web3'

export interface CallExample {
  id: ExampleFramework
  label: string
  /** npm package(s) the snippet needs. */
  install: string
  language: 'ts' | 'tsx'
  file: string
  code: string
}

export interface CallExampleSet {
  abiName: string
  items: CallExample[]
}

interface BuildInput {
  contract: ContractDoc
  fn: FunctionDoc
  chain: ChainDoc
  address?: string
  rpcUrl?: string
  account?: string
  values: FormValue[]
  /** msg.value in wei, when the function is payable. */
  value?: bigint
}

/** viem's `viem/chains` export names for the networks the UI ships with. */
const VIEM_CHAINS: Record<number, string> = {
  1: 'mainnet',
  11155111: 'sepolia',
  8453: 'base',
  84532: 'baseSepolia',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
  31337: 'anvil',
}

export function buildCallExamples(input: BuildInput): CallExampleSet {
  const { contract, fn, chain, address, rpcUrl, account, values } = input
  const abiName = abiIdentifier(contract.name)
  const isRead = fn.mutability === 'view' || fn.mutability === 'pure'
  const chainExport = VIEM_CHAINS[chain.chainId]
  const chainVar = chainExport ?? 'chain'
  const rpc = rpcUrl ?? chain.rpcUrl
  const httpExpr = rpc ? `http(${quote(rpc)})` : 'http()'
  const addressLine = `const address = ${quote(address ?? '0x...')} as const`
  const resultName = outputName(fn)
  const msgValue =
    fn.mutability === 'payable' && input.value !== undefined && input.value > 0n
      ? input.value
      : undefined
  const chainDecl = chainExport ? undefined : defineChainCode(chain, rpc)

  const viemArgs = renderArgs(fn, values, account, 'bigint')
  const web3Args = renderArgs(fn, values, account, 'string')

  const viemNames = isRead
    ? ['createPublicClient', 'http']
    : ['createPublicClient', 'createWalletClient', 'custom', 'http']
  if (!chainExport) viemNames.push('defineChain')

  const viemImports = [
    `import { ${viemNames.join(', ')} } from 'viem'`,
    chainExport ? `import { ${chainExport} } from 'viem/chains'` : undefined,
    `import { ${abiName} } from './abi'`,
  ]
    .filter(Boolean)
    .join('\n')

  const ethersRpc = quote(rpc ?? 'https://...')

  const items: CallExample[] = []

  /* ------------------------------- viem ---------------------------------- */

  if (isRead) {
    const call = [
      `const ${resultName} = await client.readContract({`,
      '  address,',
      `  abi: ${abiName},`,
      `  functionName: ${quote(fn.name)},`,
      viemArgs.length > 0 ? `  args: [${viemArgs.join(', ')}],` : undefined,
      '})',
    ]
      .filter(Boolean)
      .join('\n')

    const setup = [
      'const client = createPublicClient({',
      `  chain: ${chainVar},`,
      `  transport: ${httpExpr},`,
      '})',
      addressLine,
    ].join('\n')

    items.push({
      id: 'viem',
      label: 'viem',
      install: 'npm i viem',
      language: 'ts',
      file: 'call.ts',
      code: block(viemImports, chainDecl, setup, call),
    })
  } else {
    const request = [
      'const hash = await wallet.writeContract({',
      '  address,',
      `  abi: ${abiName},`,
      `  functionName: ${quote(fn.name)},`,
      viemArgs.length > 0 ? `  args: [${viemArgs.join(', ')}],` : undefined,
      msgValue !== undefined ? `  value: ${msgValue}n,` : undefined,
      '})',
    ]
      .filter(Boolean)
      .join('\n')

    const setup = [
      'const provider = (window as any).ethereum // injected by the browser wallet',
      `const [account] = await provider.request({ method: 'eth_requestAccounts' })`,
      '',
      'const wallet = createWalletClient({',
      '  account,',
      `  chain: ${chainVar},`,
      '  transport: custom(provider),',
      '})',
      'const client = createPublicClient({',
      `  chain: ${chainVar},`,
      `  transport: ${httpExpr},`,
      '})',
      addressLine,
    ].join('\n')

    items.push({
      id: 'viem',
      label: 'viem',
      install: 'npm i viem',
      language: 'ts',
      file: 'send.ts',
      code: block(
        viemImports,
        chainDecl,
        setup,
        request,
        'const receipt = await client.waitForTransactionReceipt({ hash })',
      ),
    })
  }

  /* ------------------------------ ethers v6 ------------------------------- */

  if (isRead) {
    const setup = [
      `const provider = new JsonRpcProvider(${ethersRpc})`,
      addressLine,
      `const contract = new Contract(address, ${abiName}, provider)`,
    ].join('\n')

    items.push({
      id: 'ethers',
      label: 'ethers v6',
      install: 'npm i ethers',
      language: 'ts',
      file: 'call.ts',
      code: block(
        `import { Contract, JsonRpcProvider } from 'ethers'\nimport { ${abiName} } from './abi'`,
        setup,
        `const ${resultName} = await contract.${fn.name}(${viemArgs.join(', ')})`,
      ),
    })
  } else {
    const callArgs = [...viemArgs]
    if (msgValue !== undefined) callArgs.push(`{ value: ${msgValue}n }`)

    const setup = [
      'const provider = new BrowserProvider((window as any).ethereum)',
      'const signer = await provider.getSigner()',
      addressLine,
      `const contract = new Contract(address, ${abiName}, signer)`,
    ].join('\n')

    items.push({
      id: 'ethers',
      label: 'ethers v6',
      install: 'npm i ethers',
      language: 'ts',
      file: 'send.ts',
      code: block(
        `import { BrowserProvider, Contract } from 'ethers'\nimport { ${abiName} } from './abi'`,
        setup,
        `const tx = await contract.${fn.name}(${callArgs.join(', ')})\nconst receipt = await tx.wait()`,
      ),
    })
  }

  /* -------------------------------- wagmi -------------------------------- */

  const componentName = `${pascalIdentifier(fn.name)}Demo`

  if (isRead) {
    const config = [
      '    address,',
      `    abi: ${abiName},`,
      `    functionName: ${quote(fn.name)},`,
      viemArgs.length > 0 ? `    args: [${viemArgs.join(', ')}],` : undefined,
      `    chainId: ${chain.chainId},`,
    ]
      .filter(Boolean)
      .join('\n')

    items.push({
      id: 'wagmi',
      label: 'wagmi',
      install: 'npm i wagmi viem',
      language: 'tsx',
      file: `${componentName}.tsx`,
      code: block(
        `import { useReadContract } from 'wagmi'\nimport { ${abiName} } from './abi'`,
        addressLine,
        `export function ${componentName}() {\n  const { data, isPending, error } = useReadContract({\n${config}\n  })\n\n  if (isPending) return <p>Loading…</p>\n  if (error) return <p>{error.message}</p>\n  return <pre>{String(data)}</pre>\n}`,
      ),
    })
  } else {
    const config = [
      '            address,',
      `            abi: ${abiName},`,
      `            functionName: ${quote(fn.name)},`,
      viemArgs.length > 0 ? `            args: [${viemArgs.join(', ')}],` : undefined,
      msgValue !== undefined ? `            value: ${msgValue}n,` : undefined,
      `            chainId: ${chain.chainId},`,
    ]
      .filter(Boolean)
      .join('\n')

    items.push({
      id: 'wagmi',
      label: 'wagmi',
      install: 'npm i wagmi viem',
      language: 'tsx',
      file: `${componentName}.tsx`,
      code: block(
        `import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'\nimport { ${abiName} } from './abi'`,
        addressLine,
        [
          `export function ${componentName}() {`,
          '  const { writeContract, data: hash, isPending, error } = useWriteContract()',
          '  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })',
          '',
          '  return (',
          '    <div>',
          '      <button',
          '        disabled={isPending || isConfirming}',
          '        onClick={() =>',
          '          writeContract({',
          config,
          '          })',
          '        }',
          '      >',
          `        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : ${quote(fn.name)}}`,
          '      </button>',
          '      {isSuccess ? <p>Confirmed: {hash}</p> : null}',
          '      {error ? <p>{error.message}</p> : null}',
          '    </div>',
          '  )',
          '}',
        ].join('\n'),
      ),
    })
  }

  /* ------------------------------- web3.js ------------------------------- */

  if (isRead) {
    items.push({
      id: 'web3',
      label: 'web3.js',
      install: 'npm i web3',
      language: 'ts',
      file: 'call.ts',
      code: block(
        `import { Web3 } from 'web3'\nimport { ${abiName} } from './abi'`,
        [
          `const web3 = new Web3(${quote(rpc ?? 'https://...')})`,
          addressLine,
          `const contract = new web3.eth.Contract(${abiName}, address)`,
        ].join('\n'),
        `const ${resultName} = await contract.methods\n  .${fn.name}(${web3Args.join(', ')})\n  .call()`,
      ),
    })
  } else {
    items.push({
      id: 'web3',
      label: 'web3.js',
      install: 'npm i web3',
      language: 'ts',
      file: 'send.ts',
      code: block(
        `import { Web3 } from 'web3'\nimport { ${abiName} } from './abi'`,
        [
          'const web3 = new Web3((window as any).ethereum)',
          'const [from] = await web3.eth.requestAccounts()',
          addressLine,
          `const contract = new web3.eth.Contract(${abiName}, address)`,
        ].join('\n'),
        [
          'const receipt = await contract.methods',
          `  .${fn.name}(${web3Args.join(', ')})`,
          `  .send({ from${msgValue !== undefined ? `, value: ${quote(msgValue.toString())}` : ''} })`,
        ].join('\n'),
      ),
    })
  }

  return { abiName, items }
}

/* --------------------------------- helpers -------------------------------- */

function block(...parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join('\n\n')
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`
}

function abiIdentifier(name: string): string {
  const words = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/)
  if (words.length === 0 || words[0] === '') return 'contractAbi'
  const camel = words
    .map((word, index) => {
      const normalized = /^[A-Z0-9_]+$/.test(word) ? word.toLowerCase() : word
      if (index === 0) return normalized.charAt(0).toLowerCase() + normalized.slice(1)
      return normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join('')
  return `${camel}Abi`
}

function pascalIdentifier(name: string): string {
  const value = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  if (!value) return 'Call'
  return /^\d/.test(value) ? `Fn${value}` : value
}

function outputName(fn: FunctionDoc): string {
  const first = fn.outputs[0]
  if (fn.outputs.length === 1 && first?.name && /^[A-Za-z_$][\w$]*$/.test(first.name)) {
    return first.name
  }
  return 'result'
}

function defineChainCode(chain: ChainDoc, rpcUrl?: string): string {
  const native = chain.nativeCurrency ?? { name: 'Ether', symbol: 'ETH', decimals: 18 }
  const rpc = rpcUrl ?? chain.rpcUrl ?? 'https://...'
  return [
    'const chain = defineChain({',
    `  id: ${chain.chainId},`,
    `  name: ${quote(chain.name)},`,
    `  nativeCurrency: { name: ${quote(native.name)}, symbol: ${quote(native.symbol)}, decimals: ${native.decimals} },`,
    `  rpcUrls: { default: { http: [${quote(rpc)}] } },`,
    '})',
  ].join('\n')
}

type BigintMode = 'bigint' | 'string'

function renderArgs(
  fn: FunctionDoc,
  values: FormValue[],
  account: string | undefined,
  bigintMode: BigintMode,
): string[] {
  return fn.inputs.map((param, index) => renderParam(param, values[index], bigintMode, account))
}

function renderParam(
  param: ParamDoc,
  raw: FormValue | undefined,
  bigintMode: BigintMode,
  account?: string,
): string {
  // Arrays keep the shape of the form, including partially-filled items.
  if (param.element) {
    const items = Array.isArray(raw) ? raw : []
    if (items.length === 0) return '[]'
    return `[${items.map((item) => renderParam(param.element!, item, bigintMode, account)).join(', ')}]`
  }

  // Structs are rendered as objects when every member has a name, arrays otherwise.
  if (param.components) {
    const source =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, FormValue>)
        : {}
    const rendered = param.components.map((component, index) =>
      renderParam(component, source[component.name || String(index)], bigintMode, account),
    )
    const named =
      param.components.length > 0 &&
      param.components.every(
        (component) => component.name && /^[A-Za-z_$][\w$]*$/.test(component.name),
      )
    if (named) {
      return `{ ${param.components
        .map((component, index) => `${component.name}: ${rendered[index]}`)
        .join(', ')} }`
    }
    return `[${rendered.join(', ')}]`
  }

  // An empty string input is a placeholder, not an intentional empty string.
  if (param.type === 'string' && (typeof raw !== 'string' || raw.trim() === '')) {
    return quote('...')
  }

  try {
    return literal(coerceParam(param, raw, ''), bigintMode)
  } catch {
    return fallback(param, account, bigintMode)
  }
}

function literal(value: unknown, bigintMode: BigintMode): string {
  if (typeof value === 'bigint') {
    return bigintMode === 'bigint' ? `${value}n` : quote(value.toString())
  }
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map((item) => literal(item, bigintMode)).join(', ')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    return `{ ${entries
      .map(([key, inner]) => `${identifierKey(key)}: ${literal(inner, bigintMode)}`)
      .join(', ')} }`
  }
  if (value === null || value === undefined) return 'null'
  return String(value)
}

function fallback(param: ParamDoc, account: string | undefined, bigintMode: BigintMode): string {
  if (param.type === 'address') return quote(account ?? '0x...')
  if (param.type === 'bool') return 'false'
  if (param.type === 'string') return quote('...')
  if (param.type === 'function') return quote('0x...')
  if (param.type.startsWith('bytes')) return quote('0x')
  if (/^u?int/.test(param.type)) return bigintMode === 'bigint' ? '0n' : quote('0')
  return quote('...')
}

function identifierKey(value: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : quote(value)
}
