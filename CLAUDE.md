# Envio Dashboard AI — Project Guide

## What This Is

Envio Dashboard AI lets users type a request in plain English — "Generate me a Uniswap V3 dashboard on Arbitrum: fees, volume and transactions for the last 90 days" — and get a live, shareable analytics dashboard built on Envio's HyperSync and HyperIndex data. The existing Envio MCP server (`docs.envio.dev/mcp`) is docs-only (`docs_search`, `docs_fetch`); no Envio product today answers questions in natural language or generates charts from on-chain data.

**Who it serves:** Envio growth/sales demos, protocol teams, analysts, and AI agents (via the bundled `envio-data-mcp` server which exposes the same data tools to Claude Code, Cursor, or any MCP-capable agent).

## Core Principle: The LLM Plans, Code Computes

The model **never produces numbers**. Every value shown in a dashboard comes from a tool result returned by the metric engine. Claude's job is to resolve the user's intent into a validated `DashboardSpec` — a plan of queries — which the renderer executes at render time. If a number cannot be traced to a tool call ID, it must not appear in the UI.

Dashboards are specs of queries, not snapshots of data. Re-running the spec against HyperSync/HyperIndex always produces fresh numbers.

## Data Sources

**HyperSync (default, ~80% of metrics)**

Raw logs, transactions, and blocks for any contract on any supported chain (81+ EVM). Nothing to deploy. Fast enough to backfill 90 days live — the main demo moment. Counts, sums, unique users, volume, and fees from Swap events all come from here. Query model: filter by address/topics/block range, select only needed fields, paginate using `next_block` until target block or `archive_height`.

- Client: `@envio-dev/hypersync-client` (Node.js PascalCase field names), Python, Rust, Go clients also available
- Authentication: `ENVIO_API_TOKEN` env var (create at envio.dev/app/api-tokens)
- Rate limits: per-token budget per 60-second window shared across chains; HTTP 429 triggers automatic client retry with backoff
- Endpoint pattern: `POST https://<network>.hypersync.xyz/query`

**HyperIndex (when state is needed)**

For metrics that depend on accumulated state — TVL, pool reserves, positions, USD prices — read from Envio's open-source indexers via their GraphQL endpoint. Available indexers: `uniswap-v4-indexer`, `uniswap-v3-indexer`, `uniswap-v2-indexer`, `aave-indexer`, `dex-prices-indexer`, `usdt0-indexer`, `ethena-indexer`. HyperIndex v3 handler syntax: `indexer.onEvent(...)`. GraphQL via Hasura (`/v1/graphql`) or Envio Cloud static endpoints. Do not rely on `_aggregate` queries on hosted deployments — pre-compute aggregates in handlers instead.

**Source declaration:** Every metric in a protocol pack declares `source: 'hypersync' | 'indexer'`. The dashboard footnote shows which source was used.

The upsell: "deploy this as your own indexer on Envio Cloud."

## Stack and Versions

- **Runtime:** Node 22, TypeScript strict ESM
- **Package manager:** pnpm workspaces
- **Testing:** Vitest (unit), Playwright (E2E)
- **Linting:** ESLint + Prettier
- **Frontend:** Next.js 15 App Router, Tailwind CSS, Recharts, TanStack Query
- **Database:** Drizzle ORM + Postgres (daily series cache), Redis (optional job queue)
- **Blockchain data:** `@envio-dev/hypersync-client`
- **MCP server:** official MCP TypeScript SDK
- **AI agent:** Anthropic SDK (`@anthropic-ai/sdk`) with Claude tool-use loop and prompt caching
  - **Model IDs (verify at time of use — these change):**
    - Speed/balance: `claude-sonnet-4-6`
    - Hard planning tasks: `claude-opus-4-8`
  - Use `thinking: {type: "adaptive"}` on 4.6+ models; `budget_tokens` is deprecated
  - Use streaming for requests that may produce long output

## Monorepo Layout

```
envio-dashboard-ai/
  packages/
    core/           # Zod schemas: MetricSeries, DashboardSpec, telemetry
    hypersync/      # typed wrapper over @envio-dev/hypersync-client → daily buckets
    metrics/        # metric engine + protocol packs (adapters) + registry + cache
      packs/
        uniswap-v2/
        uniswap-v3/
        uniswap-v4/
        aave-v3/
        erc4626/
        erc20/
        generic-activity/
      worker/       # backfill.ts — background pre-computation worker
    mcp-server/     # envio-data-mcp: stdio + Streamable HTTP MCP server (npm published)
    agent/          # Claude tool-use loop → DashboardSpec
  apps/
    web/            # Next.js 15: chat + dashboard renderer + saved/shared dashboards
  evals/            # prompt → expected spec/metrics test suite
  docs/             # add-a-protocol, mcp, methodology, playbook
  .github/
    workflows/      # ci.yml, nightly.yml, release.yml
  .changeset/       # changesets config for versioning
  Dockerfile        # multi-stage image for MCP server on Railway/Fly
  fly.toml          # Fly.io deployment config
  vercel.json       # Vercel deployment config
```

## Commands

```bash
pnpm install          # install all workspace deps
pnpm build            # build all packages
pnpm test             # run Vitest across all packages
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit across workspace
pnpm dev              # start web app + MCP server in watch mode
pnpm metric <pack> <metric> --chain <chain> --days <n>  # run a single metric
pnpm agent "<prompt>" # run the agent loop against a prompt
pnpm evals            # run the eval suite (skips without ANTHROPIC_API_KEY)
pnpm e2e              # Playwright E2E tests
pnpm backfill         # pre-compute daily series for all packs (--days N --protocol X)
pnpm changeset        # create a release changeset
```

## Deploy

**Web app (Vercel):** `vercel deploy` — set secrets in the Vercel dashboard.

**MCP server (Fly.io):**
```bash
fly deploy
fly secrets set ENVIO_API_TOKEN=... MCP_API_KEYS=...
```

**Postgres:** Vercel Postgres, Railway, or Neon. Set `DATABASE_URL`.

**Required secrets (all platforms):**
- `ENVIO_API_TOKEN` — HyperSync API token
- `ANTHROPIC_API_KEY` — Claude API key
- `DATABASE_URL` — Postgres connection string
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` — web app only

## Coding Rules

**Money and token amounts**
- All `uint256` values are `bigint` end-to-end, serialised as strings, and formatted only at render time.
- Never use JavaScript `number` for token amounts — precision loss is silent and catastrophic.

**Error handling**
- Tools return `{ error: { code: string; message: string; hint?: string } }` instead of throwing.
- Never throw from tool implementations; let the agent handle errors by reading the `error` field.
- Only validate at system boundaries (user input, external APIs, tool inputs/outputs). Trust internal code.

**Schema validation**
- Zod-validate every boundary: tool inputs, tool outputs, `DashboardSpec`, environment variables.
- Use `z.parse()` at ingress; propagate typed values internally.

**Security**
- No secrets in client code — only `NEXT_PUBLIC_` env vars may appear in the browser bundle.
- All env vars documented in `.env.example` with comments.
- On-chain strings (token names, symbols, event data) are **untrusted input**. Never interpolate them into LLM instructions. Escape them in the UI (treat as user-generated content).
- API keys stay server-side. Rate limiting on all public endpoints. No arbitrary URL fetching (SSRF risk).
- Never use `JSON.stringify` for LLM prompt interpolation of on-chain data.

**Code quality**
- No placeholder or TODO code — every function must be complete or removed.
- Small, focused modules. No premature abstractions.
- Tests next to code (`*.test.ts`), E2E in `apps/web/e2e/`.
- No unexplained test skips.

**Freshness**
- Always show "data as of block N / x min ago" on every chart and KPI.
- Stale data must look stale — never show a spinner where real data is unavailable; show the last-known value with a staleness indicator.

## Protocol Pack Rules (DefiLlama Adapter Style)

Each pack lives in `packages/metrics/packs/<protocol>/` and exports:

```typescript
interface ProtocolPack {
  id: string;                    // e.g. "uniswap-v3"
  chains: ChainConfig[];         // { chainId, startBlock, contractAddresses }
  metrics: MetricDefinition[];
}

interface MetricDefinition {
  id: string;                    // e.g. "volume_usd"
  label: string;
  methodology: string;           // plain English explanation of how it's computed
  source: 'hypersync' | 'indexer';
  unit: 'usd' | 'token' | 'count' | 'gas';
}
```

**Required tests:** Every pack must have a reconciliation test that:
1. Fetches the same metric from DefiLlama's public API (`api.llama.fi`)
2. Asserts that the pack's value is within a stated tolerance (e.g. ±5%)
3. Documents the tolerance and any known divergences

## HyperSync Rules

- Paginate with `next_block` until the target block or `archive_height`. **Never stop just because a page returns zero matches** — gaps are real, keep going.
- `to_block` is exclusive.
- Select only the fields you need — minimises payload and rate-limit pressure.
- Always include block timestamps via block field selection; do not make a separate call.
- Retry with exponential backoff on 429 (the Node.js client does this automatically — do not add a manual retry wrapper on top).
- Cache computed daily series in Postgres and fetch only the missing blocks incrementally.
- Lower `concurrency` parameter in stream config to reduce rate-limit pressure under tight budgets.

## HyperIndex Rules

- v3 handler syntax: `indexer.onEvent(EventName, handler)` — not v2 `handlers.EventName`.
- Query GraphQL via Hasura (`/v1/graphql`) or Envio Cloud's static endpoint.
- Do not rely on `_aggregate` queries on hosted deployments — pre-compute aggregates in handlers.
- USD pricing: use `dex-prices-indexer` or an on-chain oracle. State the source in the chart footnote.

## AI Agent Rules

- Always call `resolve_protocol` first before listing or fetching metrics.
- Only use metrics that `list_metrics` returns for the resolved protocol — never invent metric IDs.
- Cap the tool-call loop (default: 20 turns max).
- Feed tool errors back to the model by including the `error` field in the tool result — do not silently retry.
- Every number in a dashboard summary must map to a tool call ID (enforced in code, not just documentation).
- Per-user limits and token budgets must be enforced before the loop starts.
- Use prompt caching for the system prompt (stable content first; volatile content last).

## Definition of Done

A change is complete when:
- `pnpm build && pnpm lint && pnpm typecheck && pnpm test` all pass
- New behaviour has tests
- Docs are updated (or confirmed not to need updating)
- No unexplained test skips

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Small, focused PRs
- Changesets for publishable packages (`@envio-dashboard-ai/*`)
