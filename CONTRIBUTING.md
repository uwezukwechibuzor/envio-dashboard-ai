# Contributing

## Setup

```bash
cp .env.example .env   # fill in ENVIO_API_TOKEN and DATABASE_URL
pnpm install
pnpm build
```

## Development workflow

```bash
pnpm dev               # Next.js + MCP server in watch mode
pnpm metric uniswap-v3 fees --chain 42161 --days 7   # test a metric
pnpm test              # Vitest unit tests (no network needed)
pnpm test:reconcile    # reconciliation tests (needs ENVIO_API_TOKEN)
pnpm lint && pnpm typecheck
```

## Adding a protocol pack

1. Create `packages/metrics/src/packs/<protocol>/index.ts`.
2. Implement and export a `ProtocolPack` satisfying the schema in `packages/core`.
3. Register it in `packages/metrics/src/registry.ts`.
4. Add a reconciliation test in `packages/metrics/src/packs/<protocol>/reconcile.test.ts`.
5. Run `pnpm test` — all checks must pass with no unexplained skips.

See `docs/add-a-protocol.md` for a step-by-step walkthrough.

## Commit style

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.  
Keep PRs small and focused. Add a changeset (`pnpm changeset`) for publishable packages.
