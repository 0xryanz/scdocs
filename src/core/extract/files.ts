import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, sep } from 'node:path'

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/** Recursively collect `.json` files under `dir`. */
export async function walkJson(dir: string, limit = 20000): Promise<string[]> {
  const out: string[] = []
  const stack = [dir]
  while (stack.length > 0 && out.length < limit) {
    const current = stack.pop()!
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full)
    }
  }
  return out
}

export function toPosix(p: string): string {
  return p.split(sep).join('/')
}

export function safeParse(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Keeps the richest definition when the same contract appears in several
 *  build-info / artifact files (very common after incremental compilation). */
export function dedupe<T extends { file: string; name: string; abi: readonly any[] }>(
  items: T[],
): T[] {
  const byKey = new Map<string, T>()
  for (const item of items) {
    const key = `${item.file}:${item.name}`
    const existing = byKey.get(key)
    if (!existing || item.abi.length >= existing.abi.length) byKey.set(key, item)
  }
  return [...byKey.values()]
}

export function nameFromArtifact(jsonPath: string): string {
  return basename(jsonPath, '.json')
}
