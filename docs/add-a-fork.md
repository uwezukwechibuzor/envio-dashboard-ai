# Adding a Protocol Fork

This guide explains how to add a fork of an existing DeFi protocol to Envio Dashboard AI.

## Overview

Forks are registered as JSON files in `packages/metrics/src/forks/`. Each fork references one of five **category templates** that provide metric definitions automatically. Adding a fork is configuration, not code.

## Templates

| Template | Based on | Required chain field | Metrics provided |
|---|---|---|---|
| `dex-v2` | Uniswap V2 | `factory` | `volume_usd`, `fees_usd`, `txs` |
| `dex-v3` | Uniswap V3 | `factory` | `volume_usd`, `fees_usd`, `txs`, `unique_users` |
| `lending-aave` | Aave V3 | `pool` | `deposits_usd`, `borrows_usd`, `liquidations_count`, `txs` |
| `lending-compound` | Compound V2 | `comptroller` | `supply_txs`, `borrow_txs`, `txs` |
| `vault-erc4626` | ERC-4626 | `vaults` (array) | `deposits`, `withdrawals`, `net_flow` |

## Step 1: Create the fork JSON file

Create a file `packages/metrics/src/forks/<your-id>.json` with the following structure:

```json
{
  "id": "my-protocol-v2",
  "name": "My Protocol V2",
  "aliases": ["myprotocol", "my-protocol", "myprotocol v2"],
  "template": "dex-v2",
  "parentProtocol": "uniswap-v2",
  "chains": {
    "1": {
      "startBlock": 12345678,
      "factory": "0xYourFactoryAddressOnEthereum"
    },
    "42161": {
      "startBlock": 234567,
      "factory": "0xYourFactoryAddressOnArbitrum"
    }
  },
  "feeBps": 30,
  "notes": "Factory address from https://your-protocol.xyz/docs/addresses. Same Swap events as Uniswap V2."
}
```

### Required fields

- **`id`** — unique kebab-case identifier. Used as the protocol ID in all APIs.
- **`name`** — human-readable name.
- **`aliases`** — list of lowercase strings users might type to refer to this protocol.
- **`template`** — one of the five template names above.
- **`chains`** — per-chain config. Keys are chain IDs as strings. Each entry needs `startBlock` and the address field for the template (see table above).

### Optional fields

- **`parentProtocol`** — the protocol this is a fork of (for documentation).
- **`feeBps`** — fee in basis points, default `30` for `dex-v2`, none for others.
- **`protocolFeeShare`** — fraction of fee going to protocol treasury (0–1).
- **`eventSignatureOverrides`** — if the fork uses different event signatures, map `"standard_event" → "overridden_event"`. (Note: overrides are documented but runtime support requires custom template code.)
- **`notes`** — cite your address source here. Required for `startBlock` accuracy.

## Step 2: Register it

Add your JSON import to `packages/metrics/src/fork-registry.ts`:

```typescript
import myProtocolV2Json from './forks/my-protocol-v2.json' with { type: 'json' };

export const FORK_CONFIGS: ForkConfig[] = [
  // ... existing forks ...
  parseFork(myProtocolV2Json),
];
```

The pack is automatically registered when `registerForks()` is called (which happens in `packages/metrics/src/index.ts` during startup).

## Step 3: Verify the addresses

Run the fork verification CLI to confirm events are found on-chain:

```bash
pnpm fork verify my-protocol-v2
```

This queries HyperSync for the last 50,000 blocks on each configured chain and checks that the expected event signatures appear. Example output:

```
Verifying fork: My Protocol V2 (template: dex-v2)

  Chain 1 (ethereum): scanning blocks 20000000–20050000
    Found event: dex-v2 PairCreated ✓

  Chain 42161 (arbitrum): scanning blocks 299950000–300000000
    Found event: dex-v2 Swap ✓
```

If the scan finds nothing, check that:
1. The contract address is correct and deployed before the scan window.
2. The `startBlock` is set correctly (use the deployment block).
3. The event signatures match the template (use `pnpm fork detect` to auto-detect).

## Step 4: Auto-detect from an unknown address

If you have a contract address but are unsure which template it uses:

```bash
pnpm fork detect 0xYourAddress --chain 1
```

This scans the last 10,000 blocks and reports which event topic0s were found, with matches to known templates:

```
Detecting template for 0xYour… on chain 1

Top event signatures found:
  0xd78ad95f…  ×1420  dex-v2 Swap
  0x0d3648bd…  ×18    dex-v2 PairCreated

Detected templates:
  dex-v2  (1438 matching events)
```

## Step 5: Add a reconciliation test (optional but recommended)

If your protocol is on DefiLlama, add a reconciliation test that validates volume against the DefiLlama API:

```typescript
// packages/metrics/src/forks/my-protocol-v2.reconcile.test.ts
import { describe, it, expect } from 'vitest';

describe.skipIf(!process.env['ENVIO_API_TOKEN'])('my-protocol-v2 reconcile', () => {
  it('7-day volume within 40% of DefiLlama', async () => {
    // ... same pattern as packages/metrics/src/packs/uniswap-v3/reconcile.test.ts
  });
});
```

## Supported chains

The HyperSync wrapper supports these chain IDs: `1` (Ethereum), `42161` (Arbitrum), `8453` (Base), `10` (Optimism), `137` (Polygon), `56` (BSC), `43114` (Avalanche).

Chains beyond this list require adding a `ChainInfo` entry in `packages/hypersync/src/chains.ts`.

## Common pitfalls

**Wrong startBlock**: Setting `startBlock` too early wastes time scanning empty blocks. Setting it after deployment misses early pools/markets. Use the contract deployment transaction block.

**Non-indexed event fields**: Compound V2's `Mint` events have no indexed fields — the template decodes from `log.data`. If your fork moved fields to indexed positions, the decoding will fail silently. Check with `pnpm fork detect`.

**stablecoin pricing**: `dex-v2` and `dex-v3` volume is calculated only for pairs involving USDC/USDT/DAI. Chains with different stablecoin addresses (e.g., BSC uses different USDT/USDC addresses) need entries in `packages/metrics/src/pricing.ts`.
