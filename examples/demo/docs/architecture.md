# Architecture

The CLI has three layers:

1. **Extract** — Foundry `out/` and Hardhat `artifacts/build-info/`.
2. **Normalize** — ABI fragments plus NatSpec become one portable bundle.
3. **Render** — a static React site reads `data.json` and talks to an RPC.

## Bundle contents

| Piece | Purpose |
| --- | --- |
| contracts | ABI, functions, events, errors, NatSpec |
| chains | RPC and explorer defaults |
| pages | Authored Markdown rendered at build time |
| brand | Accent color, logo and footer |

The bundle is inlined into `index.html` as well as written to `data.json`, so
opening the build from `file://` still works.
