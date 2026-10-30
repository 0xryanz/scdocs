import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export interface NativeCurrencyConfig {
  name: string
  symbol: string
  decimals: number
}

export interface ChainConfig {
  /** Stable key used in URLs / local storage. Defaults to `chain-<chainId>`. */
  id?: string
  name?: string
  chainId: number
  /** Read-only RPC used before a wallet is connected. Users can override it in the UI. */
  rpcUrl?: string
  explorer?: string
  testnet?: boolean
  nativeCurrency?: NativeCurrencyConfig
  /** `ContractName` or `src/File.sol:ContractName` -> address. */
  contracts?: Record<string, string>
}

export interface ScdocsConfig {
  title?: string
  description?: string
  source?: {
    repo?: string
    branch?: string
    commit?: string
    pathPrefix?: string
  }
  /** Only include contracts whose name or file matches one of these globs. */
  include?: string[]
  exclude?: string[]
  /** Include contracts extracted from `lib/` / `node_modules/`. Default false. */
  includeDependencies?: boolean
  /** Contract names/ids in the order they should appear in the sidebar. */
  order?: string[]
  /** Proxy contract -> implementation contract, using names or `file:Name`. */
  proxies?: Record<string, string>
  pages?: Array<{
    slug?: string
    title?: string
    description?: string
    /** Markdown file, relative to the project root. */
    file?: string
    /** Inline Markdown, used when `file` is absent. */
    content?: string
  }>
  brand?: {
    color?: string
    logo?: string
    footer?: string
  }
  chains?: ChainConfig[]
  foundry?: { out?: string }
  hardhat?: { buildInfo?: string; artifacts?: string }
  ui?: {
    defaultChain?: string
    /** Start every function expanded. Great for a "playground first" page. */
    expandAll?: boolean
  }
}

export function defineConfig(config: ScdocsConfig): ScdocsConfig {
  return config
}

export const CONFIG_FILES = [
  'scdocs.config.ts',
  'scdocs.config.mts',
  'scdocs.config.js',
  'scdocs.config.mjs',
  'scdocs.config.json',
]

export interface LoadedConfig {
  config: ScdocsConfig
  path?: string
  root: string
}

export async function loadConfig(
  rootInput: string,
  explicitPath?: string,
): Promise<LoadedConfig> {
  const root = resolve(rootInput)

  let configPath = explicitPath
    ? isAbsolute(explicitPath)
      ? explicitPath
      : resolve(root, explicitPath)
    : CONFIG_FILES.map((name) => join(root, name)).find((p) => existsSync(p))

  if (!configPath) return { config: {}, root }
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }

  const loaded = await importConfig(configPath)
  const config: ScdocsConfig = loaded?.default ?? loaded ?? {}
  return { config, path: configPath, root }
}

async function importConfig(path: string): Promise<any> {
  if (path.endsWith('.json')) {
    const { readFile } = await import('node:fs/promises')
    return JSON.parse(await readFile(path, 'utf8'))
  }

  try {
    const { createJiti } = await import('jiti')
    const jiti = createJiti(import.meta.url, { interopDefault: true })
    return await jiti.import(path)
  } catch (error) {
    // jiti may be unavailable in exotic setups; Node 22+ can strip types itself.
    if (path.endsWith('.ts') || path.endsWith('.mts')) {
      throw new Error(
        `Could not load ${path}. Install "jiti" or use a .mjs config.\n${String(error)}`,
      )
    }
    return import(path)
  }
}

/** Tiny glob matcher: `*` matches anything, everything else is literal. */
export function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === value) return true
  if (!pattern.includes('*')) return false
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`).test(value)
}
