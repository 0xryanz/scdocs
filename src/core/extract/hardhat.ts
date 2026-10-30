import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RawContract } from '../normalize.js'
import { dedupe, pathExists, safeParse, toPosix, walkJson } from './files.js'

/**
 * Hardhat layout.
 *
 * `artifacts/contracts/**​/*.json` has the ABI but **no NatSpec** — NatSpec only
 * survives in `artifacts/build-info/*.json`, which is the full solc standard
 * JSON input+output. So build-info is the primary source.
 *
 * If build-info has been pruned we fall back to plain artifacts: the page still
 * works, it just has no prose.
 */
export async function extractHardhat(
  root: string,
  buildInfoDir = 'artifacts/build-info',
  artifactsDir = 'artifacts',
): Promise<RawContract[]> {
  const fromBuildInfo = await readBuildInfo(join(root, buildInfoDir))
  if (fromBuildInfo.length > 0) return dedupe(fromBuildInfo)

  return dedupe(await readPlainArtifacts(root, join(root, artifactsDir)))
}

async function readBuildInfo(dir: string): Promise<RawContract[]> {
  if (!(await pathExists(dir))) return []
  const out: RawContract[] = []
  for (const file of await walkJson(dir)) {
    const json = safeParse(await readFile(file, 'utf8'))
    const contracts = json?.output?.contracts
    if (!contracts || typeof contracts !== 'object') continue

    for (const [sourceFile, entries] of Object.entries(contracts as Record<string, any>)) {
      for (const [name, contract] of Object.entries(entries as Record<string, any>)) {
        const abi = contract?.abi
        if (!Array.isArray(abi) || abi.length === 0) continue
        out.push({
          file: toPosix(sourceFile),
          name,
          abi,
          devdoc: contract.devdoc,
          userdoc: contract.userdoc,
        })
      }
    }
  }
  return out
}

async function readPlainArtifacts(root: string, dir: string): Promise<RawContract[]> {
  if (!(await pathExists(dir))) return []
  const out: RawContract[] = []
  for (const file of await walkJson(dir)) {
    if (toPosix(file).includes('/build-info/')) continue
    if (toPosix(file).endsWith('.dbg.json')) continue
    const json = safeParse(await readFile(file, 'utf8'))
    if (!json || !Array.isArray(json.abi) || json.abi.length === 0) continue
    const relativePath = toPosix(file).slice(toPosix(dir).length + 1)
    // artifacts/contracts/Token.sol/Token.json -> contracts/Token.sol
    const sourceFile = relativePath.split('/').slice(0, -1).join('/')
    out.push({
      file: sourceFile || relativePath,
      name: json.contractName ?? relativePath.split('/').pop()!.replace(/\.json$/, ''),
      abi: json.abi,
      devdoc: json.devdoc,
      userdoc: json.userdoc,
    })
  }
  return out
}
