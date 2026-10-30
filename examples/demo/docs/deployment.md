# Deployment

## Local

```bash
anvil
forge script script/Deploy.s.sol --broadcast
npm run docs:build
npm run docs:serve
```

## Static hosting

The output is plain HTML, CSS and JavaScript. Use a preset to add the files a
host expects:

```bash
scdocs build --root . --out scdocs-site --preset vercel
scdocs build --root . --out scdocs-site --preset cloudflare
scdocs build --root . --out scdocs-site --preset gh-pages
```

Hash routes mean no rewrite rules are required. `llms.txt` and `mcp.json` are
written next to `data.json` for agents and tooling.

## Safety

`scdocs` refuses to write into the project root, the current working directory,
or a non-empty directory it did not generate.
