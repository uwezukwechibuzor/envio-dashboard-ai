# Metric Methodology

How each metric is computed, the data source it uses, and known caveats.

---

## Data sources

**HyperSync** (default for ~80% of metrics)

Raw logs, transactions, and blocks queried directly from Envio's HyperSync nodes. No deployment required. Covers 81+ EVM chains. Pagination uses `next_block` — gaps are real, the engine never stops early.

Endpoint: `POST https://<network>.hypersync.xyz/query`

**HyperIndex** (for state-based metrics)

For metrics requiring accumulated state (TVL, pool reserves, positions, oracle prices), data is read from Envio's open-source indexers via their Hasura GraphQL endpoint.

---

## Uniswap V3

### `volume_usd`
**Label:** Volume (USD)
**Source:** HyperSync
**Unit:** micro-USD (÷1,000,000 for display)

Sums the stablecoin side of every `Swap` event. For swaps where neither token is a known stablecoin, uses the `token1` side if `token1` is WETH/WBTC and applies the latest spot price from `dex-prices-indexer`.

**Known divergence from DefiLlama:** ±3–5% due to stale oracle prices for exotic pairs during high-volatility periods.

### `fees_usd`
**Label:** Protocol Fees (USD)
**Source:** HyperSync
**Unit:** micro-USD

Applies the pool's `fee` tier (from the `Initialize` event: 500, 3000, or 10000 bps) to `volume_usd`.

### `tvl_usd`
**Label:** TVL (USD)
**Source:** HyperIndex (uniswap-v3-indexer)
**Unit:** micro-USD

Reads cumulative liquidity from `Pool.totalValueLockedToken0/1` fields in the indexer, priced at the pool's current sqrt price.

### `tx_count`
**Label:** Transactions
**Source:** HyperSync
**Unit:** count

Count of unique transaction hashes containing at least one `Swap` event from a known pool.

### `unique_users`
**Label:** Unique Users
**Source:** HyperSync
**Unit:** count

Count of distinct `from` addresses among swap transactions. Does not de-duplicate across chains.

---

## Uniswap V2 (and V2 forks)

### `volume_usd`
Same methodology as V3 — stablecoin side of `Swap` events. V2 Swap events have a different signature (`Swap(address,uint256,uint256,uint256,uint256,address)`).

### `fees_usd`
Fixed 0.3% fee tier × volume.

---

## Uniswap V4

V4 uses a singleton `PoolManager` contract. All Swap events are emitted from the same address with the `poolId` as a topic. Volume is computed identically to V3 but filtered by `poolId`.

---

## Aave V3

### `borrow_volume_usd`
**Source:** HyperSync
**Unit:** micro-USD

Sum of `amount` from `Borrow(address,address,address,uint256,uint8,uint256,uint16)` events, priced at the oracle price at event time (from `dex-prices-indexer`).

### `repay_volume_usd`
**Source:** HyperSync

Sum of `amount` from `Repay` events.

### `tvl_usd`
**Source:** HyperIndex (aave-indexer)

Sum of `totalCurrentVariableDebt + totalLiquidity` across all active reserves, priced in USD.

---

## ERC-20 tokens

### `transfer_volume`
**Source:** HyperSync
**Unit:** token (raw, not USD)

Sum of all `Transfer` event `value` fields. Presented as the raw token unit (divide by `10^decimals` for human-readable display — the UI does this using the `decimals` field from `list_metrics`).

### `holder_count`
**Source:** HyperSync
**Unit:** count

Count of addresses that have ever received a Transfer and whose running balance > 0.

---

## ERC-4626 vaults

### `total_assets`
**Source:** HyperSync (Deposit + Withdraw events)

Running sum: `Σ Deposit.assets - Σ Withdraw.assets`. This is an approximation of TVL — exact TVL requires calling `totalAssets()` via HyperIndex.

### `vault_apy`
Not computed — APY requires yield attribution which varies per vault strategy.

---

## Generic contract activity

### `tx_count`
Count of transactions `to` the contract address in the given date range.

### `event_count`
Count of log entries emitted by the contract.

### `unique_callers`
Count of distinct `from` addresses in transactions to the contract.

---

## Pricing

For USD conversion, prices are sourced from `dex-prices-indexer` (Uniswap V3 TWAP on Ethereum). Price is taken at the block of each event, not at a fixed daily close. This can produce small differences vs exchanges that use 24h average or close price.

Stablecoins (USDC, USDT, DAI, FRAX, LUSD) are always priced at $1.00. The full stablecoin list is in `packages/metrics/src/pricing.ts`.

---

## Freshness

Every `MetricSeries` returned includes:
- `asOfBlock` — the last block included in the computation
- `asOfTimestamp` — the timestamp of that block (Unix seconds)

The UI shows "data as of block N / x min ago". Stale data (> 10 min) renders with a yellow indicator.
