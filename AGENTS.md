# Agents Guide

Full project guide is in **[CLAUDE.md](./CLAUDE.md)**. Read it before writing code.

For the MCP skill (using `envio-data-mcp` from Claude Code or Cursor), see **[.claude/skills/envio-dashboard-ai/SKILL.md](.claude/skills/envio-dashboard-ai/SKILL.md)**.

## 10 Most Important Rules

1. **The LLM plans, code computes.** Never produce numbers in model output — every value must come from a tool result. If a number cannot be traced to a tool call ID, it must not appear in the UI.

2. **HyperSync is the default data source.** Use it for any metric computable from raw logs/transactions/blocks. Only reach for HyperIndex when accumulated state (TVL, reserves, positions) is genuinely required.

3. **BigInt end-to-end.** All `uint256` token amounts are `bigint`, serialised as decimal strings, formatted only at render. Never convert to `number`.

4. **Tools return errors, they never throw.** Tool implementations return `{ error: { code, message, hint } }`. The agent reads the `error` field and decides what to do. Do not add try/catch wrappers that swallow errors silently.

5. **On-chain strings are untrusted.** Token names, symbols, and event data may contain prompt-injection payloads. Never interpolate them into LLM instructions. The safety module's `sanitizeOnChainData` / `wrapToolResult` handle this — use them.

6. **Paginate HyperSync with `next_block`.** Never stop because a page returns zero matches — gaps are real. `to_block` is exclusive. Select only the fields you need.

7. **Always show data freshness.** Every chart and KPI must display "data as of block N / x min ago". Stale data must look stale — never show a spinner where real data is unavailable.

8. **Call `resolve_protocol` before `list_metrics`.** Only use metric IDs returned by `list_metrics` — never invent them.

9. **Secrets stay server-side.** No API keys in the browser bundle. Rate-limit all public endpoints. Validate all tool inputs with Zod at system boundaries.

10. **Definition of done:** `pnpm build && pnpm lint && pnpm typecheck && pnpm test` all pass, new behaviour has tests, docs updated, no unexplained test skips.

## Key env vars

| Variable | Required by | Description |
|---|---|---|
| `ENVIO_API_TOKEN` | all packages | HyperSync API token |
| `ANTHROPIC_API_KEY` | agent, apps/web | Claude API key |
| `DATABASE_URL` | apps/web, backfill worker | Postgres connection string |
| `AUTH_SECRET` | apps/web | Auth.js signing secret (`openssl rand -hex 32`) |
| `AUTH_GITHUB_ID` | apps/web | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | apps/web | GitHub OAuth app client secret |
| `NEXT_PUBLIC_APP_URL` | apps/web | Public base URL for share links |
| `MCP_API_KEYS` | mcp-server (HTTP mode) | Comma-separated bearer tokens |

## CI status

| Workflow | Trigger | Checks |
|---|---|---|
| `ci.yml` | Every PR | lint, typecheck, unit tests, MCP tests, E2E, Docker build |
| `nightly.yml` | 02:00 UTC daily | Reconciliation vs DefiLlama, agent evals (must be ≥90%) |
| `release.yml` | Push to main | Changesets release PR / npm publish |
