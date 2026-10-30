import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { keccak256, toHex } from 'viem'
import type { ChainDoc, ContractDoc, DocsBundle, Hex } from '../shared/types.js'
import { loadConfig, matchesGlob, type ScdocsConfig } from './config.js'
import { extractFoundry } from './extract/foundry.js'
import { extractHardhat } from './extract/hardhat.js'
import { dedupe } from './extract/files.js'
import { normalizeContract, type RawContract } from './normalize.js'

export interface BuildOptions {
  root?: string
  config?: string
}

export interface BuildResult {
  bundle: DocsBundle
  warnings: string[]
}

const HARDHAT_CONFIGS = [
  'hardhat.config.ts',
  'hardhat.config.js',
  'hardhat.config.cjs',
  'hardhat.config.mjs',
]

export async function buildBundle(options: BuildOptions = {}): Promise<BuildResult> {
  const root = options.root ?? process.cwd()
  const warnings: string[] = []
  const { config } = await loadConfig(root, options.config)

  const frameworks = detectFrameworks(root, config)
  if (frameworks.length === 0) {
    warnings.push(
      `No Foundry "out/" or Hardhat "artifacts/build-info/" directory found under ${root}. ` +
        `Run "forge build" or "npx hardhat compile" first.`,
    )
  }

  const raw: RawContract[] = []
  if (frameworks.includes('foundry')) {
    raw.push(...(await extractFoundry(root, config.foundry?.out)))
  }
  if (frameworks.includes('hardhat')) {
    raw.push(
      ...(await extractHardhat(
        root,
        config.hardhat?.buildInfo,
        config.hardhat?.artifacts,
      )),
    )
  }

  const selected = dedupe(raw).filter((item) => isIncluded(item, config))
  const contracts = selected.map(normalizeContract).sort((a, b) => a.name.localeCompare(b.name))

  if (contracts.length === 0) {
    warnings.push('No contracts matched. Check "include" / "exclude" in your config.')
  }

  const chains = buildChains(config, contracts, warnings)

  const bundle: DocsBundle = {
    schemaVersion: 1,
    generator: { name: 'scdocs', version: '0.1.0' },
    generatedAt: new Date().toISOString(),
    frameworks,
    abiHash: hashAbis(contracts),
    source: config.source,
    title: config.title ?? 'Contract docs',
    description: config.description,
    chains,
    contracts,
    ui: config.ui,
  }

  return { bundle, warnings }
}

function detectFrameworks(root: string, config: ScdocsConfig): Array<'foundry' | 'hardhat'> {
  const found: Array<'foundry' | 'hardhat'> = []
  const outDir = config.foundry?.out ?? 'out'
  if (existsSync(join(root, 'foundry.toml')) || existsSync(join(root, outDir))) {
    found.push('foundry')
  }
  const buildInfo = config.hardhat?.buildInfo ?? 'artifacts/build-info'
  if (
    HARDHAT_CONFIGS.some((name) => existsSync(join(root, name))) ||
    existsSync(join(root, buildInfo))
  ) {
    found.push('hardhat')
  }
  // Nothing detected but an artifacts folder exists anyway.
  if (found.length === 0 && existsSync(join(root, 'artifacts'))) found.push('hardhat')
  return found
}

function isIncluded(item: RawContract, config: ScdocsConfig): boolean {
  const targets = [item.name, item.file, `${item.file}:${item.name}`]
  const hit = (pattern: string) => targets.some((t) => matchesGlob(pattern, t))

  if (config.include?.length) {
    if (!config.include.some(hit)) return false
  }
  if (config.exclude?.length) {
    if (config.exclude.some(hit)) return false
  }
  return true
}

function buildChains(
  config: ScdocsConfig,
  contracts: ContractDoc[],
  warnings: string[],
): ChainDoc[] {
  return (config.chains ?? []).map((chain) => {
    const id = chain.id ?? `chain-${chain.chainId}`
    const addresses: Record<string, Hex> = {}
    const unresolved: string[] = []

    for (const [key, address] of Object.entries(chain.contracts ?? {})) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        warnings.push(`[${id}] "${key}" has an invalid address: ${address}`)
        continue
      }
      const matches = contracts.filter(
        (c) => c.id === key || c.name === key || `${c.file}:${c.name}` === key,
      )
      if (matches.length === 0) {
        unresolved.push(key)
        warnings.push(`[${id}] Contract "${key}" from config is not in the build output.`)
        continue
      }
      if (matches.length > 1) {
        warnings.push(
          `[${id}] "${key}" is ambiguous (${matches.map((m) => m.file).join(', ')}). ` +
            `Use "file:Name" in the config.`,
        )
        continue
      }
      addresses[matches[0].id] = address as Hex
    }

    return {
      id,
      name: chain.name ?? `Chain ${chain.chainId}`,
      chainId: chain.chainId,
      rpcUrl: chain.rpcUrl,
      explorerUrl: chain.explorer,
      testnet: chain.testnet,
      nativeCurrency: chain.nativeCurrency,
      addresses,
      unresolved: unresolved.length ? unresolved : undefined,
    }
  })
}

function hashAbis(contracts: ContractDoc[]): string {
  const shape = contracts.map((c) => ({
    id: c.id,
    functions: c.functions.map((f) => f.signature),
    events: c.events.map((e) => e.signature),
    errors: c.errors.map((e) => e.signature),
  }))
  return keccak256(toHex(JSON.stringify(shape)))
}
