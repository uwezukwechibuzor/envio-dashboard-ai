# Adding a Protocol Pack

A protocol pack is an adapter that teaches the metric engine how to compute a specific set of metrics for a DeFi protocol using HyperSync or HyperIndex. Packs follow the same pattern as DefiLlama adapters — they declare what they can compute, not how to fetch the data infrastructure.

**Goal:** A new contributor should be able to add a working, tested protocol pack in under an hour.

---

## 1. Copy the template

```
packages/metrics/packs/my-protocol/
  index.ts           ← pack definition
  index.test.ts      ← unit tests
  reconcile.test.ts  ← DefiLlama reconciliation test
```

There is no generator yet — copy from `packages/metrics/packs/erc20/` as the simplest example, or `packages/metrics/packs/uniswap-v3/` for a full DEX example.

---

## 2. Define the pack

```typescript
// packages/metrics/packs/my-protocol/index.ts
import type { ProtocolPack } from '../../types.js';
import { computeVolume, computeFees, computeUniqueSenders } from '../../templates/dex-v3.js';

export const myProtocolPack: ProtocolPack = {
  id: 'my-protocol',              // kebab-case, used as the lookup key
  chains: [
    {
      chainId: 1,                 // Ethereum mainnet
      startBlock: 18_000_000,     // first block with protocol activity
      contractAddresses: [
        '0xAbCd...1234',          // the contract to index
      ],
    },
    {
      chainId: 42161,             // Arbitrum
      startBlock: 100_000_000,
      contractAddresses: ['0x...'],
    },
  ],
  metrics: [
    {
      id: 'volume_usd',
      label: 'Volume (USD)',
      methodology: 'Sum of the stablecoin side of all Swap events, converted at time of event.',
      source: 'hypersync',
      unit: 'usd',
      compute: computeVolume,     // from a template, or write your own
    },
    {
      id: 'fees_usd',
      label: 'Fees (USD)',
      methodology: '0.3% fee tier × volume, in USD.',
      source: 'hypersync',
      unit: 'usd',
      compute: computeFees,
    },
    {
      id: 'unique_users',
      label: 'Unique Users',
      methodology: 'Count of distinct transaction senders in the period.',
      source: 'hypersync',
      unit: 'count',
      compute: computeUniqueSenders,
    },
  ],
};
```

**Rules:**
- `id` must be unique across all packs. Run `pnpm metric my-protocol volume_usd --chain 1 --days 7` to verify it resolves.
- `methodology` is shown verbatim in the UI tooltip. Write for a DeFi analyst, not a developer.
- `source` must be `'hypersync'` for log/event/tx metrics, or `'indexer'` for state-based metrics (TVL, positions, reserves).

---

## 3. Write a custom `compute` function (if no template fits)

```typescript
// packages/metrics/packs/my-protocol/index.ts
import type { ComputeContext, MetricPoint } from '../../types.js';
import type { HyperSyncClient } from '@envio-dashboard-ai/hypersync';

export async function computeMyMetric(
  ctx: ComputeContext,
  client: HyperSyncClient,
): Promise<MetricPoint[]> {
  // 1. Build a HyperSync query
  const query = {
    fromBlock: ctx.fromBlock,
    toBlock: ctx.toBlock,                       // exclusive
    logs: [{ address: ctx.contractAddresses, topics: [MY_EVENT_TOPIC] }],
    fieldSelection: { log: ['data', 'topics', 'block_number'] },
  };

  // 2. Paginate with next_block until toBlock
  //    NEVER stop because a page returns zero matches — gaps are real.
  const events = await client.collectAllEvents(query);

  // 3. Bucket by day
  const byDay = new Map<string, bigint>();
  for (const log of events) {
    const date = ctx.blockToDate(log.blockNumber);
    const value = decodeValue(log);             // keep as bigint
    byDay.set(date, (byDay.get(date) ?? 0n) + value);
  }

  // 4. Return sorted points (value as decimal string, never number)
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: value.toString() }));
}
```

**Critical rules:**
- All token amounts are `bigint` throughout. Only convert to string at the return.
- Never use `Number()` on a raw token amount — silent precision loss.
- USD values use **micro-USD** (multiply by 1,000,000) to keep integer arithmetic.
- `to_block` in HyperSync queries is exclusive.

---

## 4. Register the pack

Add one line to `packages/metrics/src/index.ts`:

```typescript
import { myProtocolPack } from './packs/my-protocol/index.js';
registerPack(myProtocolPack);
```

---

## 5. Write a reconciliation test (required)

Every pack must include a test that checks its output against a trusted external source. For DeFi protocols, use DefiLlama:

```typescript
// packages/metrics/packs/my-protocol/reconcile.test.ts
import { describe, it, expect } from 'vitest';
import { runMetric } from '../../engine.js';
import '../../index.js'; // registers packs

const SKIP = !process.env['ENVIO_API_TOKEN'];

describe.skipIf(SKIP)('my-protocol reconciliation vs DefiLlama', () => {
  it('volume_usd is within 5% of DefiLlama (last 7 days)', async () => {
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    // Our metric
    const series = await runMetric({
      protocol: 'my-protocol',
      metric: 'volume_usd',
      chainId: 1,
      dateRange: { from: fromDate, to: toDate },
      apiToken: process.env['ENVIO_API_TOKEN']!,
    });

    const ourTotal = series.points.reduce((sum, p) => sum + BigInt(p.value), 0n);

    // DefiLlama reference
    const llamaRes = await fetch(
      `https://api.llama.fi/dex/volumes/my-protocol?excludeTotalDataChartBreakdown=true&excludeTotalDataChart=false`,
    );
    const llama = await llamaRes.json() as { totalVolume: number };
    const llamaUsd = llama.totalVolume;

    // our total is in micro-USD; convert to USD for comparison
    const ourUsd = Number(ourTotal) / 1_000_000;
    const tolerance = 0.05; // 5%

    expect(Math.abs(ourUsd - llamaUsd) / llamaUsd).toBeLessThan(tolerance);
  }, 60_000);
});
```

**Tolerance table (suggested):**

| Metric | Tolerance | Rationale |
|---|---|---|
| Volume | ±5% | Stablecoin pricing varies slightly |
| Fees | ±5% | Same as volume, proportional |
| TVL | ±10% | Exchange-rate differences |
| Tx count | ±1% | Should be exact |

Document any known divergence (e.g. "excludes mint/burn events") in a comment.

---

## 6. Verify

```bash
# Check it fetches data
pnpm metric my-protocol volume_usd --chain 1 --days 7

# Run all tests
pnpm test

# Run just this pack's reconciliation (needs ENVIO_API_TOKEN)
pnpm test:reconcile packages/metrics/src/packs/my-protocol/reconcile.test.ts
```

---

## 7. Using a fork template (fastest path for Uniswap V2 forks)

If your protocol is a Uniswap V2 or V3 fork (most DEXs are), you can register it in `packages/metrics/src/fork-registry.ts` with zero compute code:

```typescript
// In fork-registry.ts, add to FORK_CONFIGS:
{
  id: 'sushiswap',
  base: 'uniswap-v2',
  name: 'SushiSwap',
  chains: [
    { chainId: 1, startBlock: 10_794_229, contractAddresses: ['0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'] },
    { chainId: 42161, startBlock: 1_000_000, contractAddresses: ['0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'] },
  ],
},
```

The fork template automatically inherits all metrics from the base pack.

---

## 8. Open a PR

- Title: `feat(metrics): add <protocol-name> pack`
- Include the reconciliation test output in the PR description
- No test skips without explanation
