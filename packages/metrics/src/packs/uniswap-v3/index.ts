import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, countByDay, uniqueByDay, mapToPoints } from '@envio-dashboard-ai/hypersync';
import { microUsdToUsd } from '../../pricing.js';
import type { ProtocolPack } from '../../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';
import type { ComputeContext } from '../../types.js';

const SWAP_TOPIC0 = keccak256(toBytes('Swap(address,address,int256,int256,uint160,uint128,int24)'));
const POOL_CREATED_TOPIC0 = keccak256(
  toBytes('PoolCreated(address,address,uint24,int24,address)'),
);
const FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

type PoolInfo = { token0: string; token1: string; fee: number };

async function buildPoolRegistry(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<Map<string, PoolInfo>> {
  const registry = new Map<string, PoolInfo>();

  for await (const batch of streamLogs(ctx.client, {
    addresses: [FACTORY],
    topics: [[POOL_CREATED_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const log of batch.logs) {
      if (!log.topics[1] || !log.topics[2] || !log.topics[3] || !log.data) continue;
      const token0 = ('0x' + log.topics[1].slice(26)).toLowerCase();
      const token1 = ('0x' + log.topics[2].slice(26)).toLowerCase();
      const fee = Number(BigInt(log.topics[3]));
      const [, pool] = decodeAbiParameters(
        [{ type: 'int24' }, { type: 'address' }],
        log.data as `0x${string}`,
      );
      registry.set((pool as string).toLowerCase(), { token0, token1, fee });
    }
  }

  return registry;
}

type SwapData = {
  amount0: bigint;
  amount1: bigint;
  poolAddress: string;
  sender: string;
  blockNumber: number;
};

async function collectSwaps(
  ctx: ComputeContext,
  range: BlockRange,
  pools: Map<string, PoolInfo>,
): Promise<{ swaps: SwapData[]; blockTimestamps: Map<number, number> }> {
  const poolAddresses = Array.from(pools.keys());
  if (!poolAddresses.length) return { swaps: [], blockTimestamps: new Map() };

  const swaps: SwapData[] = [];
  const allTimestamps = new Map<number, number>();

  for await (const batch of streamLogs(ctx.client, {
    addresses: poolAddresses,
    topics: [[SWAP_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);

    for (const log of batch.logs) {
      if (!log.data || !log.address || log.blockNumber === undefined) continue;
      if (!log.topics[1]) continue;

      try {
        const [amount0, amount1] = decodeAbiParameters(
          [{ type: 'int256' }, { type: 'int256' }, { type: 'uint160' }, { type: 'uint128' }, { type: 'int24' }],
          log.data as `0x${string}`,
        );
        const sender = '0x' + log.topics[1].slice(26);
        swaps.push({
          amount0: amount0 as bigint,
          amount1: amount1 as bigint,
          poolAddress: log.address.toLowerCase(),
          sender,
          blockNumber: log.blockNumber,
        });
      } catch {
        // malformed log — skip
      }
    }
  }

  return { swaps, blockTimestamps: allTimestamps };
}

async function computeVolume(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, range);
  if (!pools.size) return [];

  const { swaps, blockTimestamps } = await collectSwaps(ctx, range, pools);

  const volumeBuckets = new Map<string, bigint>();
  for (const swap of swaps) {
    const pool = pools.get(swap.poolAddress);
    if (!pool) continue;
    const usd = ctx.swapUsdFromStable(pool.token0, pool.token1, swap.amount0, swap.amount1);
    if (!usd) continue;
    const val = microUsdToUsd(usd.usdMicro);
    const { blockNumber } = swap;
    const ts = blockTimestamps.get(blockNumber);
    if (ts === undefined) continue;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    volumeBuckets.set(date, (volumeBuckets.get(date) ?? 0n) + val);
  }

  return mapToPoints(volumeBuckets);
}

async function computeFees(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, range);
  if (!pools.size) return [];

  const { swaps, blockTimestamps } = await collectSwaps(ctx, range, pools);

  const feeBuckets = new Map<string, bigint>();
  for (const swap of swaps) {
    const pool = pools.get(swap.poolAddress);
    if (!pool) continue;
    const usd = ctx.swapUsdFromStable(pool.token0, pool.token1, swap.amount0, swap.amount1);
    if (!usd) continue;
    const volumeUsd = microUsdToUsd(usd.usdMicro);
    const feeUsd = (volumeUsd * BigInt(pool.fee)) / 1_000_000n;
    const ts = blockTimestamps.get(swap.blockNumber);
    if (ts === undefined) continue;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    feeBuckets.set(date, (feeBuckets.get(date) ?? 0n) + feeUsd);
  }

  return mapToPoints(feeBuckets);
}

async function computeTxs(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, range);
  if (!pools.size) return [];

  const poolAddresses = Array.from(pools.keys());
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: poolAddresses,
    topics: [[SWAP_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
    fieldSelection: { log: ['BlockNumber', 'TransactionHash'], block: ['Number', 'Timestamp'] },
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber !== undefined) items.push({ blockNumber: log.blockNumber });
    }
  }

  const buckets = countByDay(items, allTimestamps);
  return mapToPoints(buckets);
}

async function computeUniqueUsers(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, range);
  if (!pools.size) return [];

  const poolAddresses = Array.from(pools.keys());
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number; key: string }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: poolAddresses,
    topics: [[SWAP_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
    fieldSelection: {
      log: ['BlockNumber', 'Topic1'],
      block: ['Number', 'Timestamp'],
    },
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber !== undefined && log.topics[1]) {
        items.push({ blockNumber: log.blockNumber, key: log.topics[1] });
      }
    }
  }

  const buckets = uniqueByDay(items, allTimestamps);
  return mapToPoints(buckets);
}

export const uniswapV3Pack: ProtocolPack = {
  id: 'uniswap-v3',
  name: 'Uniswap V3',
  aliases: ['uniswap_v3', 'univ3', 'uniswapv3', 'uniswap v3'],
  chains: {
    '1': {
      startBlock: 12369621, // UniswapV3Factory deployment block
      factories: [FACTORY],
    },
    '42161': {
      startBlock: 165, // Arbitrum genesis is early
      factories: [FACTORY],
    },
    '8453': {
      startBlock: 1371680,
      factories: [FACTORY],
    },
  },
  metrics: {
    volume_usd: {
      id: 'volume_usd',
      label: 'Volume (USD)',
      description: 'Daily trading volume in USD',
      methodology:
        'Sum of |stablecoin side| of every Swap event on V3 pools created by the factory in the given period. ' +
        'Only swaps where token0 or token1 is USDC/USDT/DAI are counted; WETH-only pairs are excluded. ' +
        'Pool fee tiers: 0.01%, 0.05%, 0.3%, 1%.',
      source: 'hypersync',
      unit: 'usd',
      compute: computeVolume,
    },
    fees_usd: {
      id: 'fees_usd',
      label: 'Fees (USD)',
      description: 'Daily protocol fees collected in USD',
      methodology:
        'For each Swap event on a stablecoin pair: fee = volume_usd × (pool_fee_tier / 1_000_000). ' +
        'Pool fee tier is decoded from the PoolCreated event (topic3). Same stablecoin-only scope as volume_usd.',
      source: 'hypersync',
      unit: 'usd',
      compute: computeFees,
    },
    txs: {
      id: 'txs',
      label: 'Transactions',
      description: 'Daily number of swap transactions',
      methodology:
        'Count of Swap events emitted by all V3 pools created by the factory, one event per swap.',
      source: 'hypersync',
      unit: 'count',
      compute: computeTxs,
    },
    unique_users: {
      id: 'unique_users',
      label: 'Unique Users',
      description: 'Daily distinct swap initiators (topic1 of Swap event = sender address)',
      methodology:
        'Distinct count of topic1 (sender) across all Swap events per day on factory-discovered pools.',
      source: 'hypersync',
      unit: 'count',
      compute: computeUniqueUsers,
    },
  },
};
