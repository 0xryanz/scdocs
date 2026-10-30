import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { RawContract } from '../normalize.js'
import {
  dedupe,
  nameFromArtifact,
  pathExists,
  safeParse,
  toPosix,
  walkJson,
} from './files.js'

/**
 * Foundry layout: `out/<Source>.sol/<Contract>.json`.
 *
 * The artifact carries the full solc metadata, and in current Foundry it is
 * already parsed into an object (`metadata.output.devdoc` / `.userdoc`).
 * Older versions keep it as a JSON string — both are handled.
 *
 * `compilationTarget` gives the exact source path, which is far more reliable
 * than re-deriving it from the output folder name.
 */
export async function extractFoundry(root: string, outDir = 'out'): Promise<RawContract[]> {
  const base = join(root, outDir)
  if (!(await pathExists(base))) return []

  const files = await walkJson(base)
  const collected: RawContract[] = []

  for (const file of files) {
    // `out/build-info/*.json` duplicates everything with a different shape.
    if (toPosix(file).includes('/build-info/')) continue

    const json = safeParse(await readFile(file, 'utf8'))
    if (!json || !Array.isArray(json.abi) || json.abi.length === 0) continue

    // `rawMetadata` is the pristine solc metadata. Foundry's parsed `metadata`
    // object is lossy: it drops contract-level tags (title/details/custom) and
    // `stateVariables` docs. Always prefer the raw string.
    const rawMeta = json.rawMetadata ?? json.metadata
    const metadata = typeof rawMeta === 'string' ? safeParse(rawMeta) : rawMeta

    const target: Record<string, string> | undefined = metadata?.settings?.compilationTarget
    const targetFile = target ? Object.keys(target)[0] : undefined

    const fallbackFile =
      toPosix(relative(base, file)).split('/').slice(0, -1).join('/') || nameFromArtifact(file)

    collected.push({
      file: targetFile ?? fallbackFile,
      name: (targetFile && target?.[targetFile]) || nameFromArtifact(file),
      abi: json.abi,
      devdoc: json.devdoc ?? metadata?.output?.devdoc,
      userdoc: json.userdoc ?? metadata?.output?.userdoc,
    })
  }

  return dedupe(collected)
}
