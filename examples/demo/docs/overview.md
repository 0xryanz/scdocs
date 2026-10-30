# Overview

**DemoToken** is a small ERC-20 used to show what scdocs extracts from NatSpec.
It keeps the surface deliberately tiny so every generated section is visible.

## What you can do here

- Read token metadata and balances from the configured RPC.
- Simulate writes with `eth_call` before sending a transaction.
- Copy a deep link to any method and share it with a teammate.

> The documentation bundle is self-contained. The UI never reads Solidity
> source; it only needs the ABI, NatSpec and a chain endpoint.

## A quick read

```ts
const balance = await client.readContract({
  address,
  abi,
  functionName: 'balanceOf',
  args: [account],
})
```

See the [deployment page](#/page/deployment) for the local workflow.
