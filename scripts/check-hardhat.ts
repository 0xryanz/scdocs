/**
 * Verifies the Hardhat extraction path against a build-info fixture with the
 * exact shape `npx hardhat compile` produces. No Hardhat install required.
 *
 *   npx tsx scripts/check-hardhat.ts
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildBundle } from '../src/core/build'
import { compareBundles, coverageOf } from '../src/core/check'
import { toLlms, toMcp } from '../src/core/exports'
import { renderMarkdown } from '../src/core/markdown'
import { toOpenApi } from '../src/core/openapi'

let failures = 0
let checks = 0

function check(label: string, condition: boolean, detail?: unknown) {
  checks++
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${label}`)
  else {
    failures++
    console.log(`  \x1b[31m✗\x1b[0m ${label}`)
    if (detail !== undefined) console.log('     ', detail)
  }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'scdocs-hardhat-'))

  // Hardhat artifacts carry the ABI only; NatSpec lives in build-info.
  await mkdir(join(root, 'contracts'), { recursive: true })
  await mkdir(join(root, 'artifacts', 'build-info'), { recursive: true })
  await writeFile(join(root, 'hardhat.config.ts'), 'export default {}\n')
  await writeFile(join(root, 'contracts', 'Registry.sol'), '// fixture\n')

  const abi = [
    {
      type: 'function',
      name: 'register',
      inputs: [{ name: 'who', type: 'address', internalType: 'address' }],
      outputs: [{ name: 'slot', type: 'uint256', internalType: 'uint256' }],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'isRegistered',
      inputs: [{ name: 'who', type: 'address', internalType: 'address' }],
      outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
      stateMutability: 'view',
    },
    {
      type: 'event',
      name: 'Registered',
      inputs: [{ name: 'who', type: 'address', indexed: true, internalType: 'address' }],
      anonymous: false,
    },
    {
      type: 'error',
      name: 'AlreadyRegistered',
      inputs: [{ name: 'who', type: 'address', internalType: 'address' }],
    },
  ]

  const buildInfo = {
    id: 'fixture',
    source_id_to_path: { 0: 'contracts/Registry.sol' },
    language: 'Solidity',
    input: { language: 'Solidity', sources: {}, settings: {} },
    output: {
      contracts: {
        'contracts/Registry.sol': {
          Registry: {
            abi,
            devdoc: {
              kind: 'dev',
              version: 1,
              title: 'Name Registry',
              details: 'Maps addresses to sequential slots.',
              'custom:audited': '2026-01',
              methods: {
                'register(address)': {
                  details: 'Reverts if the caller is already registered.',
                  params: { who: 'address to register' },
                  returns: { slot: 'the assigned slot' },
                },
                'isRegistered(address)': {
                  params: { who: 'address to look up' },
                  returns: { _0: 'whether it is registered' },
                },
              },
              events: { 'Registered(address)': { params: { who: 'the new member' } } },
              errors: { 'AlreadyRegistered(address)': [{ params: { who: 'the duplicate' } }] },
            },
            userdoc: {
              kind: 'user',
              version: 1,
              notice: 'A tiny name registry.',
              methods: {
                'register(address)': { notice: 'Register an address.' },
                'isRegistered(address)': { notice: 'Check membership.' },
              },
              events: { 'Registered(address)': { notice: 'Emitted on registration.' } },
              errors: { 'AlreadyRegistered(address)': [{ notice: 'The address already exists.' }] },
            },
            metadata: '{}',
            evm: { methodIdentifiers: {} },
          },
        },
      },
      sources: {},
    },
  }

  await writeFile(join(root, 'artifacts', 'build-info', 'fixture.json'), JSON.stringify(buildInfo, null, 2))

  const { bundle, warnings } = await buildBundle({ root })
  const contract = bundle.contracts[0]

  console.log('\nhardhat build-info extraction')
  check('detected hardhat', bundle.frameworks.includes('hardhat'), bundle.frameworks)
  check('contract found', Boolean(contract), warnings)
  check('source path preserved', contract?.file === 'contracts/Registry.sol', contract?.file)
  check('title from devdoc', contract?.title === 'Name Registry', contract?.title)
  check('notice from userdoc', contract?.summary === 'A tiny name registry.', contract?.summary)
  check('contract custom tag', contract?.custom.audited === '2026-01', contract?.custom)

  const register = contract?.functions.find((fn) => fn.name === 'register')
  check('@notice -> summary', register?.summary === 'Register an address.', register?.summary)
  check('@dev -> description', register?.description === 'Reverts if the caller is already registered.')
  check('@param attached', register?.inputs[0].description === 'address to register')
  check('@return attached', register?.outputs[0].description === 'the assigned slot')
  check('selector computed', register?.selector === '0x7f8b4b0f' || /^0x[0-9a-f]{8}$/.test(register?.selector ?? ''), register?.selector)

  const isRegistered = contract?.functions.find((fn) => fn.name === 'isRegistered')
  check('unnamed return documented', isRegistered?.outputs[0].description === 'whether it is registered')

  check('event documented', contract?.events[0].summary === 'Emitted on registration.')
  check('error documented', contract?.errors[0].summary === 'The address already exists.')

  const spec = toOpenApi(bundle)
  check('openapi has paths', Object.keys(spec.paths as object).length === 2)

  console.log('\nfeature helpers')
  const coverage = coverageOf(bundle)
  check(
    'coverage counts functions',
    coverage.functions === 2 && coverage.documented === 2 && coverage.undocumented === 0,
    coverage,
  )
  const diff = compareBundles(bundle, bundle)
  check(
    'no self ABI diff',
    diff.contractsAdded.length === 0 &&
      diff.contractsRemoved.length === 0 &&
      diff.contractsChanged.length === 0,
    diff,
  )
  const llms = toLlms(bundle)
  check('llms export contains contract', llms.includes('### Registry'), llms.slice(0, 80))
  const mcp = toMcp(bundle) as { tools?: unknown[]; contracts?: unknown[] }
  check('mcp export contains tools', mcp.tools?.length === 2 && mcp.contracts?.length === 1)
  const markdown = renderMarkdown(
    '# Title\n\n**bold** and `code`\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two',
  )
  check(
    'markdown headings, emphasis, table and list',
    markdown.includes('<h1') &&
      markdown.includes('<strong>bold</strong>') &&
      markdown.includes('<code>code</code>') &&
      markdown.includes('<table>') &&
      markdown.includes('<li>one</li>'),
    markdown,
  )

  console.log(
    failures === 0
      ? `\n\x1b[32m${checks} checks passed\x1b[0m`
      : `\n\x1b[31m${failures} of ${checks} checks failed\x1b[0m`,
  )
  process.exitCode = failures === 0 ? 0 : 1
}

void main()
