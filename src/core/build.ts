import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { keccak256, toHex } from 'viem'
import type { ChainDoc, ContractDoc, DocsBundle, DocsPage, Hex } from '../shared/types.js'
import { loadConfig, matchesGlob, type ScdocsConfig } from './config.js'
import { extractFoundry } from './extract/foundry.js'
import { extractHardhat } from './extract/hardhat.js'
import { dedupe } from './extract/files.js'
import { renderMarkdown, slugify } from './markdown.js'
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
  const contracts = orderContracts(
    selected.map(normalizeContract).sort((a, b) => a.name.localeCompare(b.name)),
    config.order,
    warnings,
  )
  applyProxies(contracts, config.proxies, warnings)

  if (contracts.length === 0) {
    warnings.push('No contracts matched. Check "include" / "exclude" in your config.')
  }

  const chains = buildChains(config, contracts, warnings)
  const pages = await buildPages(root, config.pages, warnings)

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
    pages: pages.length > 0 ? pages : undefined,
    brand: config.brand && Object.values(config.brand).some(Boolean) ? config.brand : undefined,
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
  if (!config.includeDependencies && isDependencyFile(item.file)) return false

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

/** Foundry and Hardhat dependency folders, excluded unless explicitly opted in. */
const DEPENDENCY_DIRS = new Set([
  'lib',
  'node_modules',
  '.deps',
  'dependencies',
  'vendor',
])

function isDependencyFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '')
  const head = normalized.split('/')[0]
  return DEPENDENCY_DIRS.has(head)
}

function orderContracts(
  contracts: ContractDoc[],
  order: string[] | undefined,
  warnings: string[],
): ContractDoc[] {
  if (!order?.length) return contracts

  const used = new Set<string>()
  const sorted: ContractDoc[] = []
  for (const key of order) {
    const matches = contracts.filter((contract) => !used.has(contract.id) && matchesContract(contract, key))
    if (matches.length === 0) {
      warnings.push(`Contract "${key}" from "order" is not in the build output.`)
      continue
    }
    if (matches.length > 1) {
      warnings.push(
        `"${key}" in "order" is ambiguous (${matches.map((match) => match.file).join(', ')}). ` +
          `Use "file:Name".`,
      )
    }
    const chosen = matches[0]
    used.add(chosen.id)
    sorted.push(chosen)
  }

  for (const contract of contracts) {
    if (!used.has(contract.id)) sorted.push(contract)
  }
  return sorted
}

function applyProxies(
  contracts: ContractDoc[],
  proxies: Record<string, string> | undefined,
  warnings: string[],
): void {
  if (!proxies) return
  for (const [proxyKey, implementationKey] of Object.entries(proxies)) {
    const proxyMatches = contracts.filter((contract) => matchesContract(contract, proxyKey))
    const implementationMatches = contracts.filter((contract) =>
      matchesContract(contract, implementationKey),
    )
    if (proxyMatches.length !== 1 || implementationMatches.length !== 1) {
      const which = proxyMatches.length !== 1 ? proxyKey : implementationKey
      warnings.push(`Proxy mapping "${proxyKey}" -> "${implementationKey}": "${which}" did not match exactly one contract.`)
      continue
    }
    proxyMatches[0].proxyTargetId = implementationMatches[0].id
  }
}

function matchesContract(contract: ContractDoc, key: string): boolean {
  return (
    contract.id === key ||
    contract.name === key ||
    `${contract.file}:${contract.name}` === key
  )
}

async function buildPages(
  root: string,
  pages: ScdocsConfig['pages'],
  warnings: string[],
): Promise<DocsPage[]> {
  if (!pages?.length) return []

  const out: DocsPage[] = []
  const used = new Set<string>()

  for (const [index, page] of pages.entries()) {
    let source = page.content ?? ''
    if (page.file) {
      try {
        source = await readFile(resolve(root, page.file), 'utf8')
      } catch (error) {
        warnings.push(`Could not read docs page "${page.file}": ${String(error)}`)
        continue
      }
    }
    if (!source.trim()) {
      warnings.push(`Docs page "${page.title ?? page.file ?? index}" is empty.`)
      continue
    }

    const heading = /^#\s+(.+?)\s*$/m.exec(source)?.[1]
    const title = page.title ?? heading ?? page.file ?? `Page ${index + 1}`
    let slug = slugify(page.slug ?? (page.file ? basename(page.file, extname(page.file)) : title))
    if (!slug) slug = `page-${index + 1}`
    if (used.has(slug)) {
      let suffix = 2
      while (used.has(`${slug}-${suffix}`)) suffix += 1
      slug = `${slug}-${suffix}`
    }
    used.add(slug)

    out.push({
      slug,
      title,
      description: page.description,
      html: renderMarkdown(source),
      file: page.file,
    })
  }

  return out
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
