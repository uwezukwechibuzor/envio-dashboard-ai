# Agents Guide

Full project guide is in **[CLAUDE.md](./CLAUDE.md)**. Read it before writing code.

## 10 Most Important Rules

1. **The LLM plans, code computes.** Never produce numbers in model output — every value must come from a tool result. If a number cannot be traced to a tool call ID, it must not appear in the UI.

2. **HyperSync is the default data source.** Use it for any metric that can be computed from raw logs/transactions/blocks. Only reach for HyperIndex when accumulated state (TVL, reserves, positions) is genuinely required.

3. **BigInt end-to-end.** All `uint256` token amounts are `bigint`, serialised as strings, formatted only at render. Never convert to `number`.

4. **Tools return errors, they never throw.** Tool implementations return `{ error: { code, message, hint } }` — the agent reads the `error` field and decides what to do. Do not add try/catch wrappers that swallow errors silently.

5. **On-chain strings are untrusted.** Token names, symbols, and event data may contain prompt-injection payloads. Never interpolate them into LLM instructions. Escape them in the UI.

6. **Paginate HyperSync with `next_block`.** Never stop because a page returns zero matches — gaps are real. `to_block` is exclusive. Select only the fields you need.

7. **Always show data freshness.** Every chart and KPI must display "data as of block N / x min ago". Stale data must look stale.

8. **Call `resolve_protocol` before `list_metrics`.** Only use metric IDs returned by `list_metrics` — never invent them.

9. **Secrets stay server-side.** No API keys in the browser bundle. Rate-limit all public endpoints. Validate all tool inputs with Zod at system boundaries.

10. **Definition of done:** `pnpm build && pnpm lint && pnpm typecheck && pnpm test` all pass, new behaviour has tests, and no test skips are unexplained.
