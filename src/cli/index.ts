import { cp, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DocsBundle } from '../shared/types.js'
import { buildBundle } from '../core/build.js'
import { toOpenApi } from '../core/openapi.js'

/** Works both from `dist/cli.js` and from `src/cli/index.ts` (tsx during dev). */
function findPackageDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

const pkgDir = findPackageDir()

/* ------------------------------- tiny console ------------------------------ */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const c = {
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
}

/* -------------------------------- arg parsing ------------------------------ */

type Flags = Record<string, string | boolean>

function parseFlags(args: string[]): Flags {
  const flags: Flags = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('-')) continue
    const body = arg.replace(/^--?/, '')
    if (body.includes('=')) {
      const [key, ...rest] = body.split('=')
      flags[key] = rest.join('=')
      continue
    }
    const next = args[i + 1]
    if (next && !next.startsWith('-')) {
      flags[body] = next
      i++
    } else {
      flags[body] = true
    }
  }
  return flags
}

function str(flags: Flags, key: string, fallback?: string): string | undefined {
  const value = flags[key]
  return typeof value === 'string' ? value : fallback
}

/* --------------------------------- commands -------------------------------- */

async function cmdBuild(flags: Flags): Promise<void> {
  const root = resolve(str(flags, 'root', process.cwd())!)
  const outDir = resolve(str(flags, 'out', join(root, 'scdocs-site'))!)
  const started = Date.now()

  const { bundle, warnings } = await buildBundle({ root, config: str(flags, 'config') })
  reportBundle(bundle, warnings)

  const siteDir = await renderSite()
  await rmrf(outDir)
  await cp(siteDir, outDir, { recursive: true })
  await writeFile(join(outDir, 'data.json'), JSON.stringify(bundle, null, 2))
  await writeFile(join(outDir, 'openapi.json'), JSON.stringify(toOpenApi(bundle), null, 2))
  await injectInlineData(outDir, bundle)

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `\n${c.green('✓')} site ${c.dim(`(${elapsed}s)`)} → ${c.cyan(outDir)}`,
  )
  console.log(c.dim(`  serve it with:  scdocs serve --dir ${rel(outDir)}`))

  if (flags.open) {
    await openInBrowser(`file://${join(outDir, 'index.html')}`)
  }
}

async function cmdDev(flags: Flags): Promise<void> {
  const root = resolve(str(flags, 'root', process.cwd())!)
  const port = Number(str(flags, 'port', '5173'))
  const host = str(flags, 'host', '127.0.0.1')!
  const configPath = str(flags, 'config')

  let lastWarnings = 0
  const load = async (): Promise<DocsBundle> => {
    const { bundle, warnings } = await buildBundle({ root, config: configPath })
    if (lastWarnings !== warnings.length) {
      reportBundle(bundle, warnings)
      lastWarnings = warnings.length
    }
    return bundle
  }

  await load()

  const { createServer } = await import('vite')
  const server = await createServer({
    root: pkgDir,
    configFile: join(pkgDir, 'vite.config.ts'),
    server: { port, host, strictPort: false, open: Boolean(flags.open) },
    plugins: [
      {
        name: 'scdocs-data',
        configureServer(devServer) {
          devServer.middlewares.use((req, res, next) => {
            const path = (req.url ?? '').split('?')[0]
            if (path !== '/data.json' && path !== '/openapi.json') return next()
            load()
              .then((bundle) => {
                const body = path === '/data.json' ? bundle : toOpenApi(bundle)
                res.setHeader('content-type', 'application/json')
                res.setHeader('cache-control', 'no-store')
                res.end(JSON.stringify(body))
              })
              .catch((error) => {
                res.statusCode = 500
                res.setHeader('content-type', 'application/json')
                res.end(JSON.stringify({ error: String(error?.stack ?? error) }))
              })
          })
        },
      },
    ],
  })

  await server.listen()
  server.printUrls()
  console.log(c.dim('  data.json is regenerated on every request — refresh after rebuilding contracts.'))
}

async function cmdServe(flags: Flags): Promise<void> {
  const dir = resolve(str(flags, 'dir', join(process.cwd(), 'scdocs-site'))!)
  const port = Number(str(flags, 'port', '8080'))
  if (!existsSync(join(dir, 'index.html'))) {
    console.error(c.red(`No index.html in ${dir}. Run "scdocs build" first.`))
    process.exitCode = 1
    return
  }

  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  }

  createHttpServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    let filePath = join(dir, urlPath === '/' ? 'index.html' : urlPath)
    if (!filePath.startsWith(dir)) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }
    try {
      if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html')
    } catch {
      res.statusCode = 404
      res.end('not found')
      return
    }
    try {
      const body = await readFile(filePath)
      res.setHeader('content-type', types[extname(filePath)] ?? 'application/octet-stream')
      res.end(body)
    } catch {
      res.statusCode = 404
      res.end('not found')
    }
  }).listen(port, () => {
    console.log(`${c.green('✓')} serving ${c.cyan(dir)}\n  ${c.cyan(`http://localhost:${port}`)}`)
  })
}

async function cmdOpenApi(flags: Flags): Promise<void> {
  const root = resolve(str(flags, 'root', process.cwd())!)
  const out = resolve(str(flags, 'out', join(root, 'openapi.json'))!)
  const { bundle, warnings } = await buildBundle({ root, config: str(flags, 'config') })
  reportBundle(bundle, warnings)
  await writeFile(out, JSON.stringify(toOpenApi(bundle), null, 2))
  console.log(`${c.green('✓')} openapi.json → ${c.cyan(out)}`)
}

/* --------------------------------- helpers -------------------------------- */

function reportBundle(bundle: DocsBundle, warnings: string[]): void {
  const functions = bundle.contracts.reduce((sum, contract) => sum + contract.functions.length, 0)
  console.log(
    `${c.bold('scdocs')} ${c.dim('·')} ${bundle.contracts.length} contracts, ${functions} functions ` +
      `${c.dim(`[${bundle.frameworks.join(' + ') || 'none'}]`)}`,
  )
  for (const warning of warnings) console.log(c.yellow(`  ! ${warning}`))
}

/** Runs Vite when developing from source; uses the prebuilt bundle when installed. */
async function renderSite(): Promise<string> {
  const prebuilt = join(pkgDir, 'dist', 'ui')
  const hasSources = existsSync(join(pkgDir, 'src', 'ui', 'App.tsx'))

  if (hasSources) {
    const { build } = await import('vite')
    await build({
      root: pkgDir,
      configFile: join(pkgDir, 'vite.config.ts'),
      logLevel: 'warn',
      build: { outDir: prebuilt, emptyOutDir: true },
    })
    return prebuilt
  }

  if (!existsSync(join(prebuilt, 'index.html'))) {
    throw new Error(
      'The UI bundle is missing from this scdocs install (dist/ui). Reinstall the package.',
    )
  }
  return prebuilt
}

/** Injects the bundle inline so the built site also works from `file://`. */
async function injectInlineData(outDir: string, bundle: DocsBundle): Promise<void> {
  const indexPath = join(outDir, 'index.html')
  const html = await readFile(indexPath, 'utf8')
  const payload = JSON.stringify(bundle).replace(/</g, '\\u003c')
  const tag = `<script id="scdocs-data" type="application/json">${payload}</script>`
  const injected = html.includes('</body>') ? html.replace('</body>', `${tag}\n</body>`) : html + tag
  await writeFile(indexPath, injected)
}

async function rmrf(dir: string): Promise<void> {
  const { rm } = await import('node:fs/promises')
  await rm(dir, { recursive: true, force: true })
}

function rel(path: string): string {
  const relativePath = path.startsWith(process.cwd()) ? path.slice(process.cwd().length + 1) : path
  return relativePath || '.'
}

async function openInBrowser(url: string): Promise<void> {
  const { spawn } = await import('node:child_process')
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(command, [url], { stdio: 'ignore', detached: true }).unref()
}

function help(): void {
  console.log(`${c.bold('scdocs')} — contract docs from Solidity NatSpec

${c.bold('Usage')}
  scdocs build   [--root .] [--out scdocs-site] [--open]
  scdocs dev     [--root .] [--port 5173] [--host 127.0.0.1]
  scdocs serve   [--dir scdocs-site] [--port 8080]
  scdocs openapi [--root .] [--out openapi.json]

${c.bold('Options')}
  --config <path>   Use a specific scdocs.config.{ts,js,mjs,json}
  --root <path>     Project root (default: cwd)

${c.bold('Notes')}
  Reads Foundry \`out/\` and Hardhat \`artifacts/build-info/\`.
  Build your contracts first: \`forge build\` or \`npx hardhat compile\`.`)
}

/* ---------------------------------- main ---------------------------------- */

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const flags = parseFlags(rest)

  try {
    switch (command) {
      case 'build':
        await cmdBuild(flags)
        break
      case 'dev':
      case 'start':
        await cmdDev(flags)
        break
      case 'serve':
      case 'preview':
        await cmdServe(flags)
        break
      case 'openapi':
        await cmdOpenApi(flags)
        break
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        help()
        break
      default:
        console.error(c.red(`Unknown command: ${command}`))
        help()
        process.exitCode = 1
    }
  } catch (error) {
    console.error(c.red(`\n✗ ${(error as Error)?.message ?? error}`))
    if (process.env.SCDOCS_DEBUG) console.error(error)
    process.exitCode = 1
  }
}

void main()
