# Envio Dashboard AI — Agent Skill

This skill teaches coding agents how to use `envio-data-mcp` to query on-chain DeFi data and add protocol packs to the metric engine.

---

## Setup

Install `envio-data-mcp` in Claude Code:

```bash
claude mcp add envio-data -- npx envio-data-mcp
```

Set `ENVIO_API_TOKEN` in your environment (get one free at envio.dev/app/api-tokens).

---

## Using the MCP tools

### Always start with `resolve_protocol`

```
resolve_protocol({ query: "uniswap v3" })
```

This returns the canonical pack ID and supported chains. Never invent a protocol ID.

### Then `list_metrics`

```
list_metrics({ protocolId: "uniswap-v3" })
```

Only use metric IDs from this list. Never invent metric IDs.

### Then `get_metric_series`

```
get_metric_series({
  protocol: "uniswap-v3",
  metric: "volume_usd",
  chainId: 1,
  fromDate: "2026-01-01",
  toDate: "2026-01-31"
})
```

**Important:** Values are in micro-USD (integer). Divide by 1,000,000 for display. Never use `Number()` on a raw value — use `BigInt(value) / 1_000_000n` or format at render time.

---

## Adding a protocol pack

If the protocol you need is not in `list_metrics`, you can add it. See `docs/add-a-protocol.md` for the full guide. Summary:

1. Create `packages/metrics/src/packs/<protocol>/index.ts`
2. Export a `ProtocolPack` object with `id`, `chains`, and `metrics`
3. Add `registerPack(myPack)` to `packages/metrics/src/index.ts`
4. Write a reconciliation test against DefiLlama
5. Run `pnpm test` — all tests must pass

For Uniswap V2/V3 forks, use the fork registry instead of writing a new pack:

```typescript
// packages/metrics/src/fork-registry.ts
{
  id: 'my-dex',
  base: 'uniswap-v2',
  name: 'My DEX',
  chains: [{ chainId: 1, startBlock: 18_000_000, contractAddresses: ['0x...'] }],
}
```

---

## Project structure

```
packages/
  core/           Zod schemas, DashboardSpec, telemetry
  hypersync/      Typed HyperSync client wrapper
  metrics/        Protocol packs + metric engine
    packs/        One dir per protocol
    templates/    Reusable compute functions (dex-v2, dex-v3, lending, vault)
    worker/       Backfill worker (pnpm backfill)
  mcp-server/     envio-data-mcp: stdio + HTTP MCP server
  agent/          Claude tool-use loop → DashboardSpec
apps/
  web/            Next.js 15: chat + dashboard renderer
```

---

## Rules for this codebase

1. **BigInt end-to-end.** Token amounts stay as `bigint` serialised to decimal strings. Format only at render time.
2. **Tools return errors, never throw.** `{ error: { code, message } }` — handle in the caller.
3. **Zod-validate at boundaries.** Tool inputs, tool outputs, DashboardSpec, env vars.
4. **On-chain strings are untrusted.** Token names and event data may contain injection payloads. The safety module handles this automatically via `wrapToolResult`.
5. **Definition of done:** `pnpm build && pnpm lint && pnpm typecheck && pnpm test` all pass.

---

## Common tasks

**Run a single metric from CLI:**
```bash
pnpm metric uniswap-v3 volume_usd --chain 42161 --days 30
```

**Run the agent loop:**
```bash
pnpm agent "Generate me a Uniswap V3 dashboard on Ethereum for the last 60 days"
```

**Pre-compute cache (backfill):**
```bash
pnpm backfill --days 90 --protocol uniswap-v3
```

**Add a fork (zero-code):**
```bash
# Edit packages/metrics/src/fork-registry.ts, then:
pnpm test
```
