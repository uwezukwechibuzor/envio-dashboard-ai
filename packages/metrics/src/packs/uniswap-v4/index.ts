import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, mapToPoints } from "@envio-dashboard-ai/hypersync";
import type { ProtocolPack, ComputeContext } from '../../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

/**
 * Uniswap V4 reads from PoolManager events directly (HyperSync) rather than
 * per-pool contracts. PoolManager emits Swap events on behalf of all pools.
 *
 * Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1,
 *      uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)
 */
const SWAP_TOPIC0 = keccak256(
  toBytes('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24,uint256)'),
);

// PoolManager addresses
const POOL_MANAGER_ETH = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const POOL_MANAGER_ARB = '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32';
const POOL_MANAGER_BASE = '0x498581fF718922c3f8e6A244956aF099B2652B2b';

function getPoolManager(chainId: number): string {
  if (chainId === 42161) return POOL_MANAGER_ARB;
  if (chainId === 8453) return POOL_MANAGER_BASE;
  return POOL_MANAGER_ETH;
}

async function computeSwapMetric(
  ctx: ComputeContext,
  range: BlockRange,
  mode: 'volume' | 'fees' | 'txs',
): Promise<MetricSeriesPoint[]> {
  const poolManager = getPoolManager(ctx.chainId);
  const valueBuckets = new Map<string, bigint>();
  const allTimestamps = new Map<number, number>();

  for await (const batch of streamLogs(ctx.client, {
    addresses: [poolManager],
    topics: [[SWAP_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);

    for (const log of batch.logs) {
      if (!log.data || log.blockNumber === undefined) continue;

      try {
        const [amount0, , , fee] = decodeAbiParameters(
          [
            { type: 'int128' },
            { type: 'int128' },
            { type: 'uint160' },
            { type: 'uint128' },
            { type: 'int24' },
            { type: 'uint24' },
            { type: 'uint256' },
          ],
          log.data as `0x${string}`,
        );

        const ts = allTimestamps.get(log.blockNumber);
        if (ts === undefined) continue;
        const date = new Date(ts * 1000).toISOString().slice(0, 10);

        if (mode === 'txs') {
          valueBuckets.set(date, (valueBuckets.get(date) ?? 0n) + 1n);
          continue;
        }

        // For volume/fees we need token addresses from pool id — not available without
        // a separate PoolKey lookup. Use a conservative placeholder: amount0 * fee as proxy.
        // In production, integrate with the uniswap-v4-indexer GraphQL endpoint for accurate USD.
        const absAmount = (amount0 as bigint) < 0n ? -(amount0 as bigint) : (amount0 as bigint);
        if (mode === 'volume') {
          valueBuckets.set(date, (valueBuckets.get(date) ?? 0n) + absAmount);
        } else {
          const feeAmount = (absAmount * BigInt(fee as unknown as number)) / 1_000_000n;
          valueBuckets.set(date, (valueBuckets.get(date) ?? 0n) + feeAmount);
        }
      } catch {
        // malformed log — skip
      }
    }
  }

  return mapToPoints(valueBuckets);
}

export const uniswapV4Pack: ProtocolPack = {
  id: 'uniswap-v4',
  name: 'Uniswap V4',
  aliases: ['uniswap_v4', 'univ4', 'uniswapv4', 'uniswap v4'],
  chains: {
    '1': { startBlock: 21688009, contracts: [POOL_MANAGER_ETH] },
    '42161': { startBlock: 300000000, contracts: [POOL_MANAGER_ARB] },
    '8453': { startBlock: 24940455, contracts: [POOL_MANAGER_BASE] },
  },
  metrics: {
    volume_token: {
      id: 'volume_token',
      label: 'Volume (token units)',
      description: 'Daily absolute value of amount0 from Swap events (token units, not USD)',
      methodology:
        'Reads Swap events from PoolManager. USD pricing requires knowing the pool token addresses from ' +
        'PoolKey storage, which is not in the event data. For accurate USD volume, use the ' +
        'uniswap-v4-indexer GraphQL endpoint. This metric returns raw token0 units as a proxy.',
      source: 'hypersync',
      unit: 'token',
      compute: (ctx, range) => computeSwapMetric(ctx, range, 'volume'),
    },
    fees_token: {
      id: 'fees_token',
      label: 'Fees (token units)',
      description: 'Daily fees: amount0_abs × fee_tier / 1_000_000',
      methodology:
        'fee = |amount0| × (fee_bps / 1_000_000) using the fee field from each Swap event. Token units only.',
      source: 'hypersync',
      unit: 'token',
      compute: (ctx, range) => computeSwapMetric(ctx, range, 'fees'),
    },
    txs: {
      id: 'txs',
      label: 'Transactions',
      description: 'Daily swap count on the PoolManager',
      methodology: 'Count of Swap events on the PoolManager contract.',
      source: 'hypersync',
      unit: 'count',
      compute: (ctx, range) => computeSwapMetric(ctx, range, 'txs'),
    },
  },
};
