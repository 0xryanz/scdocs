/**
 * End-to-end smoke test.
 *
 * Spins up a throwaway anvil, deploys the demo contract, then drives every call
 * exactly the way the browser does: form strings -> coerceArgs() -> viem.
 * If the encoding is wrong, anvil rejects it — this is the test that matters.
 *
 *   npx tsx scripts/smoke.ts
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { coerceArgs, type FormValue } from '../src/ui/lib/coerce'
import { decodeRevert } from '../src/ui/lib/errors'
import type { ContractDoc, DocsBundle, FunctionDoc } from '../src/shared/types'

const ROOT = join(import.meta.dirname, '..')
const DEMO = join(ROOT, 'examples', 'demo')
const PORT = 8599
const RPC = `http://127.0.0.1:${PORT}`

// Anvil's well-known first account. Never use this anywhere real.
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex

let failures = 0
let checks = 0

function check(label: string, condition: boolean, detail?: unknown) {
  checks++
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`)
  } else {
    failures++
    console.log(`  \x1b[31m✗\x1b[0m ${label}`)
    if (detail !== undefined) console.log('     ', detail)
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  const b = JSON.stringify(expected, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  check(label, a === b, `${a} !== ${b}`)
}

async function waitForRpc(url: string, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      })
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`anvil did not start on ${url}`)
}

async function main() {
  // Rebuild artifacts + docs so the test always runs against fresh output.
  console.log('building contracts and docs…')
  spawnSync('forge', ['build'], { cwd: DEMO, stdio: 'inherit' })
  spawnSync('npx', ['tsx', 'src/cli/index.ts', 'build', '--root', 'examples/demo', '--out', 'examples/demo/site'], {
    cwd: ROOT,
    stdio: 'ignore',
  })

  const bundle: DocsBundle = JSON.parse(readFileSync(join(DEMO, 'site', 'data.json'), 'utf8'))
  const contract = bundle.contracts.find((item) => item.name === 'DemoToken')!
  const artifact = JSON.parse(readFileSync(join(DEMO, 'out', 'DemoToken.sol', 'DemoToken.json'), 'utf8'))

  let anvil: ChildProcess | undefined
  try {
    anvil = spawn('anvil', ['--port', String(PORT), '--silent'], { stdio: 'ignore' })
    await waitForRpc(RPC)

    const account = privateKeyToAccount(KEY)
    const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) })
    const walletClient = createWalletClient({ account, chain: foundry, transport: http(RPC) })

    const deployHash = await walletClient.deployContract({
      abi: contract.abi as Abi,
      bytecode: artifact.bytecode.object as Hex,
      args: ['Demo Token', 'DMO'],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
    const address = receipt.contractAddress!
    console.log(`\ndeployed at ${address}\n`)

    const byName = (name: string, typeWord?: string) => {
      const candidates = contract.functions.filter((fn) => fn.name === name)
      if (!typeWord) return candidates[0]
      return candidates.find((fn) => fn.signature.includes(typeWord))!
    }

    /** The exact path the UI takes: form strings -> coerced args -> call. */
    const read = async (fn: FunctionDoc, form: FormValue[]) => {
      const args = coerceArgs(fn.inputs, form)
      return publicClient.readContract({
        address,
        abi: [fn.abi] as Abi,
        functionName: fn.name,
        args,
      } as any) as Promise<any>
    }

    const write = async (fn: FunctionDoc, form: FormValue[], value = 0n) => {
      const args = coerceArgs(fn.inputs, form)
      const hash = await walletClient.writeContract({
        address,
        abi: [fn.abi] as Abi,
        functionName: fn.name,
        args,
        value,
      } as any)
      return publicClient.waitForTransactionReceipt({ hash })
    }

    console.log('read path')
    eq('owner()', await read(byName('owner'), []), account.address)
    eq('name()', await read(byName('name'), []), 'Demo Token')
    eq('version() has no NatSpec', byName('version').undocumented, true)

    console.log('\nwrite path + state variable getters')
    await write(byName('mint'), [OTHER, '1000'])
    eq('balanceOf(OTHER) after mint', await read(byName('balanceOf'), [OTHER]), 1000n)
    eq('totalSupply()', await read(byName('totalSupply'), []), 1000n)

    console.log('\ntuple argument (struct)')
    const setMeta = byName('setMeta')
    eq('setMeta input is a struct', setMeta.inputs[0].type, '(string,string,uint8)')
    await write(setMeta, [{ name: 'Renamed', symbol: 'RNM', decimals: '6' }])
    const meta = (await read(byName('meta'), [])) as [Record<string, unknown>, bigint]
    eq('meta().name', meta[0].name, 'Renamed')
    eq('meta().decimals', String(meta[0].decimals), '6')

    console.log('\narray argument')
    await write(byName('mint'), [account.address, '1000'])
    await write(byName('batchTransfer'), [
      [OTHER, OTHER],
      ['60', '940'],
    ])
    eq('sender drained', await read(byName('balanceOf'), [account.address]), 0n)
    eq('recipients credited', await read(byName('balanceOf'), [OTHER]), 2000n)

    console.log('\narray return value')
    const holders = (await read(byName('holders'), [])) as [readonly Hex[], readonly bigint[]]
    check('holders() returned addresses', holders[0].length === 2, holders[0])
    eq('holders() returned balances', holders[1].map(String), ['2000', '0'])

    console.log('\noverloads encode to different selectors')
    const pingUint = byName('ping', 'uint256')
    const pingBytes = byName('ping', 'bytes32')
    check('distinct selectors', pingUint.selector !== pingBytes.selector, [
      pingUint.selector,
      pingBytes.selector,
    ])
    eq('ping(uint256)', await read(pingUint, ['42']), 42n)
    eq(
      'ping(bytes32)',
      await read(pingBytes, ['0x' + '11'.repeat(32)]),
      '0x' + '11'.repeat(32),
    )

    console.log('\ninput normalisation (IME + clipboard)')
    const balanceOf = byName('balanceOf')
    const fullWidth = (text: string) =>
      [...text]
        .map((char) => {
          const code = char.charCodeAt(0)
          return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char
        })
        .join('')
    eq('full-width IME address', coerceArgs(balanceOf.inputs, [fullWidth(OTHER)]), [OTHER])
    eq(
      'zero-width characters stripped',
      coerceArgs(balanceOf.inputs, [`0x${'ab'.repeat(20)}\u200b`]),
      [`0x${'ab'.repeat(20)}`],
    )
    eq(
      'stray whitespace stripped',
      coerceArgs(balanceOf.inputs, [` 0x${'ab'.repeat(20)}\n`]),
      [`0x${'ab'.repeat(20)}`],
    )
    let rejection = ''
    try {
      coerceArgs(balanceOf.inputs, ['0x1234'])
    } catch (error) {
      rejection = (error as Error).message
    }
    check('bad address error reports the input length', /got 6 characters/.test(rejection), rejection)
    let empty = ''
    try {
      coerceArgs(balanceOf.inputs, [''])
    } catch (error) {
      empty = (error as Error).message
    }
    check('empty address says "is required"', /is required/.test(empty), empty)

    console.log('\npayable call')
    await write(byName('buy'), [], 10n ** 18n) // 1 ETH -> 1000 tokens
    eq('buy() credited tokens', await read(byName('balanceOf'), [account.address]), 1000n)

    console.log('\ncustom error decoding (the pre-flight simulation path)')
    const transfer = byName('transfer')
    let caught: unknown
    try {
      await publicClient.simulateContract({
        address,
        abi: [transfer.abi] as Abi,
        functionName: transfer.name,
        args: coerceArgs(transfer.inputs, [OTHER, '99999999']),
        account: account.address,
      } as any)
    } catch (error) {
      caught = error
    }
    const decoded = decodeRevert(caught, contract.errors)
    eq('decoded as custom error', decoded.kind, 'custom')
    eq('error name', decoded.title, 'InsufficientBalance')
    eq('error args', (decoded.args ?? []).map(String), ['1000', '99999999'])
    check('error carries revert data', Boolean(decoded.raw?.startsWith('0x')), decoded.raw)

    console.log('\nopenapi export')
    const spec = JSON.parse(readFileSync(join(DEMO, 'site', 'openapi.json'), 'utf8'))
    eq('openapi version', spec.openapi, '3.1.0')
    check(
      'one path per function',
      Object.keys(spec.paths).length === contract.functions.length,
      Object.keys(spec.paths).length,
    )
    check('events exported as webhooks', 'Transfer' in spec.webhooks || 'DemoToken.Transfer' in spec.webhooks)
  } finally {
    anvil?.kill()
  }

  console.log(
    failures === 0
      ? `\n\x1b[32m${checks} checks passed\x1b[0m`
      : `\n\x1b[31m${failures} of ${checks} checks failed\x1b[0m`,
  )
  process.exitCode = failures === 0 ? 0 : 1
}

void main()
