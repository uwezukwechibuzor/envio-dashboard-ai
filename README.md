# Envio Dashboard AI

Type a request in plain English and get a live, shareable DeFi analytics dashboard in ~15 seconds — built on [Envio's HyperSync](https://docs.envio.dev) with no subgraph required.

> _"Generate me a Uniswap V3 dashboard on Arbitrum: fees, volume, and transactions for the last 90 days"_

**[→ Live demo](https://envio-dashboard.ai)** · [MCP server](https://www.npmjs.com/package/envio-data-mcp) · [Add a protocol](docs/add-a-protocol.md)

---

## How it works

```
User prompt
    │
    ▼
Claude agent loop (claude-sonnet-4-6 / claude-opus-4-8)
    │  calls tools: resolve_protocol → list_metrics → get_metric_series × N
    │
    ▼
DashboardSpec  ← validated JSON plan of queries, not data snapshots
    │
    ▼
Next.js renderer  ← re-runs each query on every view (live data)
    │
    ▼
Shareable link /d/:id  ←  OpenGraph preview, CSV export, fork button
```

**The LLM plans, code computes.** The model never produces numbers. Every value shown in a dashboard comes from a tool call result. Numbers without a tool call ID cannot appear in the UI.

---

## Quickstart (local dev)

```bash
# 1. Clone and install
git clone https://github.com/envio-dev/envio-dashboard-ai
cd envio-dashboard-ai
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set ENVIO_API_TOKEN and ANTHROPIC_API_KEY at minimum

# 3. Build packages
pnpm build

# 4. Start the web app
pnpm dev

# Open http://localhost:3000
```

**Required env vars:**
- `ENVIO_API_TOKEN` — get free at [envio.dev/app/api-tokens](https://envio.dev/app/api-tokens)
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `DATABASE_URL` — Postgres (local: `postgres://postgres:password@localhost:5432/envio_dashboard`)

For the full list see [.env.example](.env.example) and [apps/web/.env.example](apps/web/.env.example).

---

## MCP server (use in Claude Code / Cursor)

```bash
# Install in Claude Code
claude mcp add envio-data -- npx envio-data-mcp

# Or run standalone
ENVIO_API_TOKEN=... npx envio-data-mcp
```

See [docs/mcp.md](docs/mcp.md) for Claude Desktop and Cursor setup.

---

## Architecture

```
envio-dashboard-ai/
  packages/
    core/           Zod schemas: MetricSeries, DashboardSpec, telemetry
    hypersync/      Typed wrapper over @envio-dev/hypersync-client
    metrics/        Metric engine + protocol packs + registry + cache
      packs/        uniswap-v2/v3/v4, aave-v3, erc4626, erc20, generic-activity
      worker/       Background backfill worker (pnpm backfill)
    mcp-server/     envio-data-mcp: stdio + HTTP MCP server (npm package)
    agent/          Claude tool-use loop → DashboardSpec
  apps/
    web/            Next.js 15: chat + dashboard renderer + save/share
  evals/            30+ prompt → expected spec/metrics test cases
  docs/             add-a-protocol, mcp, methodology, playbook
```

**Data sources:**
- **HyperSync** (default): raw logs/txs/blocks for any contract on 81+ EVM chains. Backfills 90 days live.
- **HyperIndex** (state-based): TVL, reserves, positions via Hasura GraphQL.

---

## Commands

```bash
pnpm build                              # build all packages
pnpm test                               # Vitest unit tests (74 tests)
pnpm lint                               # ESLint
pnpm typecheck                          # tsc --noEmit across workspace
pnpm dev                                # start web app + watch
pnpm metric uniswap-v3 volume_usd \
  --chain 42161 --days 30               # run a single metric
pnpm agent "Uniswap V3 on Arbitrum"     # run agent loop
pnpm evals                              # agent eval suite (30+ prompts)
pnpm e2e                                # Playwright E2E tests
pnpm backfill --days 90                 # pre-compute all metrics
pnpm changeset                          # create a changeset for release
```

---

## Adding a protocol

See **[docs/add-a-protocol.md](docs/add-a-protocol.md)** — a new contributor can add a protocol pack in under an hour. Every pack must include a DefiLlama reconciliation test.

---

## Deploy

**Web app → Vercel:**

```bash
vercel deploy
# Set env vars in Vercel dashboard (see apps/web/.env.example)
```

**MCP server → Fly.io:**

```bash
fly deploy
# Set secrets: fly secrets set ENVIO_API_TOKEN=... MCP_API_KEYS=...
```

**Postgres:** Use Vercel Postgres, Railway, or Neon. Set `DATABASE_URL`.

---

## CI / nightly evals

GitHub Actions runs on every PR:
- Lint, typecheck, unit tests, MCP protocol tests, Playwright E2E, Docker build

Nightly at 02:00 UTC:
- Reconciliation tests vs DefiLlama (tolerance: ±5%)
- Agent eval suite (30+ prompts, pass rate must be ≥90%)
- Summary posted as a commit comment; releases blocked if pass rate drops

---

## Stack

- **Runtime:** Node 22, TypeScript strict ESM
- **Frontend:** Next.js 15 App Router, Tailwind CSS, Recharts, TanStack Query v5
- **Auth:** Auth.js v5 (GitHub OAuth)
- **Database:** Drizzle ORM + Postgres
- **AI:** Anthropic SDK, `claude-sonnet-4-6` / `claude-opus-4-8`
- **Blockchain data:** `@envio-dev/hypersync-client`
- **MCP:** official MCP TypeScript SDK
- **Package manager:** pnpm workspaces
- **Testing:** Vitest, Playwright

---

## License

Apache-2.0 · Built on [Envio HyperSync](https://docs.envio.dev)
