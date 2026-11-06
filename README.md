# scdocs

Solidity NatSpec → a Swagger-like doc site you can actually call.

Every function becomes a documented card with an input form, a pre-flight
simulation, and a wallet-connected call. No contract changes, no proxy, no
server, no private keys anywhere near it.

```
Foundry out/  ─┐
               ├─→ NatSpec + ABI ─→ docs bundle ─→ static site (viem + wallet)
Hardhat build- ┘                              └─→ openapi.json
info/
```

## Install

Requires Node.js 20+.

```bash
npm install -g scdocs
scdocs --help
```

Or run it without a global install:

```bash
npx scdocs@latest --help
```

The package is published on npm as [`scdocs`](https://www.npmjs.com/package/scdocs).

## Quick start

```bash
# Foundry
forge build
scdocs init                      # writes scdocs.config.ts + npm scripts
npm run docs:build               # → ./scdocs-site
npm run docs:serve               # → http://localhost:8080

# Hardhat
npx hardhat compile
scdocs init
npm run docs:build
```

`scdocs init` detects Foundry (`foundry.toml`) and Hardhat
(`hardhat.config.*`), writes a config that only includes project sources, adds a
`scdocs-site/` ignore rule and wires `docs:build` / `docs:serve` scripts when a
`package.json` is present.

`scdocs dev` runs the same site with hot reload and regenerates the docs bundle on
every request, so you can recompile contracts and just refresh.

`scdocs build --dry-run` does the full extraction and safety checks but writes
nothing. `scdocs doctor` is the same inspection with a health report and a
non-zero exit when the build would be empty.

## What you get

| Feature | Source |
|---|---|
| Page title, sections, contract intro | `@title`, `@notice`, `@dev` |
| Function summary / description | `@notice`, `@dev` |
| Parameter docs, types, validation | `@param`, ABI |
| Return docs | `@returns`, ABI |
| Event + error docs, `topic0` / selector | `@notice` on `event` / `error` |
| Badges (`access`, `example`, …) | `@custom:<name> <value>` |
| Contract address per chain | `scdocs.config.ts` |
| "View source" link | `source.repo` + `branch`/`commit` |
| Authored Overview / Architecture / Deployment pages | `pages` in config (Markdown) |
| Sidebar order, brand color, logo, footer | `order`, `brand` |
| Deep links to contract, method or page | generated hash routes |
| Global search across pages, contracts, methods, events and errors | `⌘K` / `Ctrl K` |
| EIP-1967 proxy detection | live `eth_getStorageAt` + `proxies` mapping |
| Event log viewer | live `eth_getLogs` |
| Call-as simulation and multicall reads | live RPC |

Anything undocumented still gets a usable card: the signature, type hints and
form inputs all come from the ABI. The page tells you how many functions are
missing NatSpec instead of failing.

### NatSpec tips

```solidity
/// @notice Mint new tokens.                → the one-line summary
/// @dev Only the owner can mint.           → the longer explanation
/// @param to recipient                     → label under the input
/// @return the minted amount               → label on the result
/// @custom:access owner                    → renders as a badge
function mint(address to, uint256 amount) external returns (uint256);
```

`@custom:` is official NatSpec that solc ignores, which makes it the only safe
place to put extra structured metadata without touching code.

## Config

`scdocs.config.ts` (or `.mts`, `.js`, `.mjs`, `.json`) in the project root:

```ts
import { defineConfig } from 'scdocs'

export default defineConfig({
  title: 'My Protocol',
  description: 'Docs for the v2 deployment.',

  source: {
    repo: 'https://github.com/acme/protocol',
    branch: 'main',
    pathPrefix: 'packages/contracts/',
  },

  // Hides everything else, including dependencies.
  include: ['src/**'],
  exclude: ['src/mocks/**'],

  // Dependency folders (lib/, node_modules/, vendor/, …) are excluded by
  // default. Set this to true only when you really want third-party ABIs.
  includeDependencies: false,

  // Sidebar order. Unlisted contracts stay alphabetical after these.
  order: ['Token', 'Registry'],

  // Proxy -> implementation, matched by name or `file:Name`.
  proxies: {
    TokenProxy: 'Token',
  },

  // Authored pages, rendered from Markdown at build time.
  pages: [
    { title: 'Overview', file: 'docs/overview.md' },
    { title: 'Deployment', file: 'docs/deployment.md' },
  ],

  brand: {
    color: '#f97316',
    logo: 'https://acme.com/logo.svg',
    footer: 'Acme protocol docs',
  },

  chains: [
    {
      id: 'base',
      name: 'Base',
      chainId: 8453,
      rpcUrl: 'https://base-rpc.publicnode.com',
      explorer: 'https://basescan.org',
      contracts: {
        Token: '0x…',
        // 'src/Registry.sol:Registry': '0x…' when names collide
      },
    },
    {
      id: 'anvil',
      name: 'Anvil',
      chainId: 31337,
      rpcUrl: 'http://127.0.0.1:8545',
      testnet: true,
      contracts: {},
    },
  ],

  ui: { defaultChain: 'base' },
})
```

Method forms start collapsed. Set `ui: { expandAll: true }` (or use the
Settings drawer) to open every form on load.

Contract keys resolve by `Name`, by `file:Name`, or by `file:Name:Name`. An
unresolvable name is reported as a warning rather than silently dropped.

`pages` entries accept either `file` (relative to the project root) or inline
`content`; the page title falls back to the first `#` heading. Markdown is
rendered at build time with headings, lists, tables, fenced code, blockquotes,
links and inline emphasis. Raw HTML is escaped. `order` uses the same contract
keys as `chains[].contracts`, and `proxies` maps a proxy contract to the
implementation whose ABI should be offered when EIP-1967 detection finds an
implementation address. `brand.logo` is used as a CSS background URL, so point
it at a hosted asset or a data URL.

## The site

**Chain selector** — pick any configured chain, plus a dozen built-in public
networks (Ethereum, Base, Arbitrum, OP, Polygon, Sepolia, Anvil…). Everything
below adapts: the RPC, the explorer links and the default contract addresses.

**Project links** — the bottom of the sidebar is pinned and always shows the
source repository (GitHub icon + address, click to open) and the project's fixed
donation address with a copy button.

**Address override** — an address field sits under every contract title. Paste a
freshly deployed address and the whole page retargets, no rebuild. Overrides are
remembered per chain in `localStorage`.

**Read** — `eth_call` through the configured RPC. The connected account is sent
as `from`, so `msg.sender`-dependent views return what *you* would see (this is
the single most common bug in ABI explorers, which send `0x0`).

**Write** — simulate first, then sign:

```
eth_call simulation → ok? → estimateContractGas → wallet signature → receipt
                    ↘ revert? decode it, show the reason, send nothing
```

Reverts are decoded properly: `Error(string)`, `Panic(uint256)` (with a plain
English explanation), and custom errors from the contract, including arguments.

**cast** — every card exposes the equivalent `cast call` / `cast send` command and
the raw calldata, for when you'd rather stay in the terminal.

**Pages and deep links** — authored pages appear above contracts in the sidebar.
Every contract, method and page has a shareable hash route:

```
#/contract/src%2FToken.sol%3AToken
#/contract/src%2FToken.sol%3AToken/fn-70a08231
#/page/overview
```

Opening a method route expands that card. The `link` button on a method copies
the current deep link; method-nav clicks update the hash too.

**Proxy contracts** — when a configured address has a non-zero EIP-1967
implementation slot, the contract page shows the implementation address and an
explorer link. If `proxies` maps the proxy to another contract in the bundle,
one click opens that implementation's docs with the detected address applied.

**Event logs** — each event has a log viewer with optional `from` / `to` block
inputs. It queries `eth_getLogs` for the current address; leaving the range empty
reads the latest 5,000 blocks. Decoded arguments, block numbers and transaction
links are shown per log.

**Call-as and multicall** — read cards accept an optional `from` address, so
`msg.sender`-dependent views can be simulated as any account without connecting
a wallet. The read section also has a batch panel for parameterless getters. It
uses Multicall3 when the chain has it, and falls back to one `eth_call` per
function on local chains without a deployment.

## CLI

```bash
scdocs init      # detect the framework, write config, scripts and .gitignore
scdocs build     # atomic build; --dry-run, --preset, --open
scdocs doctor    # health report, non-zero exit when the build is empty/unsafe
scdocs check     # ABI diff vs a baseline + NatSpec coverage; CI-friendly
scdocs export    # llms | mcp | openapi, --out - writes to stdout
scdocs dev       # hot-reloading local docs site
scdocs serve     # serve a built directory
```

Deployment presets add the files a host expects:

```bash
scdocs build --root . --out scdocs-site --preset vercel
scdocs build --root . --out scdocs-site --preset cloudflare
scdocs build --root . --out scdocs-site --preset gh-pages
```

Vercel gets `vercel.json`, Cloudflare Pages gets `_headers`, GitHub Pages gets
`.nojekyll`; all presets also write `404.html`. Builds are atomic: the site is
written to a temporary sibling directory and renamed into place only after every
file succeeds, so a failed build never leaves a half-written docs folder.

The output guard refuses the project root, the current directory, and any
non-empty directory that does not contain an `.scdocs` marker.

### ABI diff and docs coverage

```bash
# Write a baseline, commit it, then compare future builds in CI.
scdocs check --root . --write-baseline scdocs.baseline.json
scdocs check --root . --baseline scdocs.baseline.json

# Fail when NatSpec coverage drops below 80%, or when anything is undocumented.
scdocs check --root . --min-coverage 80
scdocs check --root . --fail-on-undocumented --json
```

`scdocs check` compares contract/function signatures, mutability, outputs,
events and errors. Removed contracts, removed functions and changed signatures
are breaking and exit non-zero; added functions are reported but allowed.

### Agent exports

Every build writes `llms.txt` (a compact contract/function index) and `mcp.json`
(a provider-neutral tool manifest with JSON Schema inputs) next to `data.json`.
The same payloads are available on demand:

```bash
scdocs export --format llms --out - > llms.txt
scdocs export --format mcp --out mcp.json
scdocs export --format openapi --out openapi.json
```


## OpenAPI export

```bash
npx scdocs openapi --root . --out openapi.json
```

One `POST` path per function, keyed by selector (so overloads never collide),
`x-mutability` / `x-payable` / `x-errors` extensions, events as `webhooks`, and a
response schema per return value. `scdocs build` also writes `openapi.json` next
to `data.json`. Numbers are typed as strings — `uint256` does not fit in a JSON
number.

## Output

```
scdocs-site/
├── index.html      bundle inlined, so the page also works from file://
├── assets/*.js
├── data.json       the docs bundle (what the UI reads)
├── openapi.json
├── llms.txt        compact index for LLMs and text search
├── mcp.json        provider-neutral tool manifest
└── 404.html        written by deployment presets
```

## Testing

```bash
npm test
```

- `scripts/check-hardhat.ts` — extracts from a build-info fixture with the exact
  shape Hardhat emits.
- `scripts/smoke.ts` — spawns Anvil, deploys the demo contract, then drives reads,
  writes, struct args, array args, overloads, payable calls and custom-error
  decoding through the same `coerceArgs()` path the browser uses.

## Notes and limits

- **Proxy contracts**: scdocs detects the EIP-1967 implementation slot at
  runtime. Add both ABIs to the build and map `proxies: { Proxy: 'Implementation' }`
  to get an "Open implementation docs" action. Beacons and custom proxy slots
  are not auto-resolved.
- **Receipt-level reverts**: if a transaction is mined and reverts, no revert data
  exists to decode — the card shows the failure and gas used. That's why the
  simulation step exists.
- **Never put a private key in the docs server.** Signing is client-side, always.
  There is no backend.
- `@custom:` values are passed through unchanged; scdocs never interprets them.

## Repo layout

```
src/core/     extraction (foundry, hardhat) → normalize → DocsBundle → OpenAPI,
              Markdown pages, llms/MCP exports, ABI diff + coverage
src/cli/      init / build / doctor / check / export / dev / serve
src/ui/       React + viem single-page app, hash router, pages, proxy/log panels
examples/     demo Foundry project used by the tests
scripts/      smoke tests
```
