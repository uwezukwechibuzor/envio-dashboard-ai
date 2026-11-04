import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, countByDay, uniqueByDay, mapToPoints } from '@envio-dashboard-ai/hypersync';
import { microUsdToUsd } from '../pricing.js';
import type { ForkConfig } from '@envio-dashboard-ai/core';
import type { ProtocolPack, ComputeContext } from '../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

const POOL_CREATED_TOPIC0 = keccak256(
  toBytes('PoolCreated(address,address,uint24,int24,address)'),
);
const SWAP_TOPIC0 = keccak256(
  toBytes('Swap(address,address,int256,int256,uint160,uint128,int24)'),
);

type PoolInfo = { token0: string; token1: string; fee: number };

async function buildPoolRegistry(
  ctx: ComputeContext,
  factory: string,
  range: BlockRange,
): Promise<Map<string, PoolInfo>> {
  const registry = new Map<string, PoolInfo>();
  for await (const batch of streamLogs(ctx.client, {
    addresses: [factory],
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
      if (!log.data || !log.address || log.blockNumber === undefined || !log.topics[1]) continue;
      try {
        const [amount0, amount1] = decodeAbiParameters(
          [
            { type: 'int256' },
            { type: 'int256' },
            { type: 'uint160' },
            { type: 'uint128' },
            { type: 'int24' },
          ],
          log.data as `0x${string}`,
        );
        swaps.push({
          amount0: amount0 as bigint,
          amount1: amount1 as bigint,
          poolAddress: log.address.toLowerCase(),
          sender: '0x' + log.topics[1].slice(26),
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
  factory: string,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, factory, range);
  if (!pools.size) return [];

  const { swaps, blockTimestamps } = await collectSwaps(ctx, range, pools);
  const volumeBuckets = new Map<string, bigint>();

  for (const swap of swaps) {
    const pool = pools.get(swap.poolAddress);
    if (!pool) continue;
    const usd = ctx.swapUsdFromStable(pool.token0, pool.token1, swap.amount0, swap.amount1);
    if (!usd) continue;
    const val = microUsdToUsd(usd.usdMicro);
    const ts = blockTimestamps.get(swap.blockNumber);
    if (ts === undefined) continue;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    volumeBuckets.set(date, (volumeBuckets.get(date) ?? 0n) + val);
  }

  return mapToPoints(volumeBuckets);
}

async function computeFees(
  ctx: ComputeContext,
  range: BlockRange,
  factory: string,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, factory, range);
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
  factory: string,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, factory, range);
  if (!pools.size) return [];

  const poolAddresses = Array.from(pools.keys());
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: poolAddresses,
    topics: [[SWAP_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
    fieldSelection: { log: ['BlockNumber'], block: ['Number', 'Timestamp'] },
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber !== undefined) items.push({ blockNumber: log.blockNumber });
    }
  }

  return mapToPoints(countByDay(items, allTimestamps));
}

async function computeUniqueUsers(
  ctx: ComputeContext,
  range: BlockRange,
  factory: string,
): Promise<MetricSeriesPoint[]> {
  const pools = await buildPoolRegistry(ctx, factory, range);
  if (!pools.size) return [];

  const poolAddresses = Array.from(pools.keys());
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number; key: string }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: poolAddresses,
    topics: [[SWAP_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
    fieldSelection: { log: ['BlockNumber', 'Topic1'], block: ['Number', 'Timestamp'] },
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber !== undefined && log.topics[1]) {
        items.push({ blockNumber: log.blockNumber, key: log.topics[1] });
      }
    }
  }

  return mapToPoints(uniqueByDay(items, allTimestamps));
}

export function createDexV3Pack(config: ForkConfig): ProtocolPack {
  const chains: ProtocolPack['chains'] = {};
  for (const [chainId, chainCfg] of Object.entries(config.chains)) {
    if (chainCfg.factory) {
      chains[chainId] = { startBlock: chainCfg.startBlock, factories: [chainCfg.factory] };
    }
  }

  return {
    id: config.id,
    name: config.name,
    aliases: config.aliases,
    chains,
    metrics: {
      volume_usd: {
        id: 'volume_usd',
        label: 'Volume (USD)',
        description: 'Daily trading volume in USD',
        methodology:
          `Stablecoin side of every Swap event on V3 pools created by the ${config.name} factory. ` +
          'Only USDC/USDT/DAI pairs counted; WETH-only pairs excluded. Fee tier from PoolCreated event.',
        source: 'hypersync',
        unit: 'usd',
        compute: (ctx, range) => {
          const factory = config.chains[String(ctx.chainId)]?.factory;
          if (!factory) return Promise.resolve([]);
          return computeVolume(ctx, range, factory);
        },
      },
      fees_usd: {
        id: 'fees_usd',
        label: 'Fees (USD)',
        description: 'Daily protocol fees collected in USD',
        methodology:
          `For each Swap on a stablecoin pair: fee = volume_usd × (pool_fee_tier / 1_000_000). ` +
          'Pool fee tier is decoded from PoolCreated event (topic3).',
        source: 'hypersync',
        unit: 'usd',
        compute: (ctx, range) => {
          const factory = config.chains[String(ctx.chainId)]?.factory;
          if (!factory) return Promise.resolve([]);
          return computeFees(ctx, range, factory);
        },
      },
      txs: {
        id: 'txs',
        label: 'Transactions',
        description: 'Daily swap count',
        methodology: `Count of Swap events on all ${config.name} pools discovered via the factory.`,
        source: 'hypersync',
        unit: 'count',
        compute: (ctx, range) => {
          const factory = config.chains[String(ctx.chainId)]?.factory;
          if (!factory) return Promise.resolve([]);
          return computeTxs(ctx, range, factory);
        },
      },
      unique_users: {
        id: 'unique_users',
        label: 'Unique Users',
        description: 'Daily distinct swap initiators',
        methodology: `Distinct count of Swap event topic1 (sender) per day on ${config.name} pools.`,
        source: 'hypersync',
        unit: 'count',
        compute: (ctx, range) => {
          const factory = config.chains[String(ctx.chainId)]?.factory;
          if (!factory) return Promise.resolve([]);
          return computeUniqueUsers(ctx, range, factory);
        },
      },
    },
  };
}
