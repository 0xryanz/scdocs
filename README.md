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

## Why not just Swagger UI

Swagger's "Try it out" sends HTTP. A contract call needs a signature and an RPC
endpoint, and `msg.sender` / `msg.value` have no HTTP equivalent. So the ABI is
turned into an OpenAPI-shaped document for *reading* and agent/codegen use, but
the interactive page encodes against the ABI directly and signs client-side.

## Quick start

```bash
# Foundry
forge build
npx scdocs build --root .        # → ./scdocs-site
npx scdocs serve --dir scdocs-site

# Hardhat
npx hardhat compile
npx scdocs build --root .
```

`scdocs dev` runs the same site with hot reload and regenerates the docs bundle on
every request, so you can recompile contracts and just refresh.

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

  ui: { expandAll: true, defaultChain: 'base' },
})
```

Contract keys resolve by `Name`, by `file:Name`, or by `file:Name:Name`. An
unresolvable name is reported as a warning rather than silently dropped.

## The site

**Chain selector** — pick any configured chain, plus a dozen built-in public
networks (Ethereum, Base, Arbitrum, OP, Polygon, Sepolia, Anvil…). Everything
below adapts: the RPC, the explorer links and the default contract addresses.

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
└── openapi.json
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

- **Proxy contracts**: the docs describe the ABI you compiled. Add the
  implementation's ABI and point it at the proxy address.
- **Receipt-level reverts**: if a transaction is mined and reverts, no revert data
  exists to decode — the card shows the failure and gas used. That's why the
  simulation step exists.
- **Never put a private key in the docs server.** Signing is client-side, always.
  There is no backend.
- `@custom:` values are passed through unchanged; scdocs never interprets them.

## Repo layout

```
src/core/     extraction (foundry, hardhat) → normalize → DocsBundle → OpenAPI
src/cli/      build / dev / serve / openapi
src/ui/       React + viem single-page app
examples/     demo Foundry project used by the tests
scripts/      smoke tests
```
