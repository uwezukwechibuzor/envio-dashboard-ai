import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, countByDay, mapToPoints } from "@envio-dashboard-ai/hypersync";
import { microUsdToUsd } from '../../pricing.js';
import type { ProtocolPack, ComputeContext } from '../../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

const PAIR_CREATED_TOPIC0 = keccak256(toBytes('PairCreated(address,address,address,uint256)'));
const SWAP_TOPIC0 = keccak256(
  toBytes('Swap(address,uint256,uint256,uint256,uint256,address)'),
);

const FACTORY_ETH = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const FACTORY_ARB = '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9';
const FEE_BPS = 30n; // 0.30 %

type PairInfo = { token0: string; token1: string };

async function buildPairRegistry(
  ctx: ComputeContext,
  factory: string,
  range: BlockRange,
): Promise<Map<string, PairInfo>> {
  const registry = new Map<string, PairInfo>();

  for await (const batch of streamLogs(ctx.client, {
    addresses: [factory],
    topics: [[PAIR_CREATED_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const log of batch.logs) {
      if (!log.topics[1] || !log.topics[2] || !log.data) continue;
      const token0 = ('0x' + log.topics[1].slice(26)).toLowerCase();
      const token1 = ('0x' + log.topics[2].slice(26)).toLowerCase();
      const [pair] = decodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        log.data as `0x${string}`,
      );
      registry.set((pair as string).toLowerCase(), { token0, token1 });
    }
  }

  return registry;
}

async function computeVolume(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<MetricSeriesPoint[]> {
  const factory = ctx.chainId === 42161 ? FACTORY_ARB : FACTORY_ETH;
  const pairs = await buildPairRegistry(ctx, factory, range);
  if (!pairs.size) return [];

  const pairAddresses = Array.from(pairs.keys());
  const volumeBuckets = new Map<string, bigint>();
  const allTimestamps = new Map<number, number>();

  for await (const batch of streamLogs(ctx.client, {
    addresses: pairAddresses,
    topics: [[SWAP_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);

    for (const log of batch.logs) {
      if (!log.data || !log.address || log.blockNumber === undefined) continue;
      const pair = pairs.get(log.address.toLowerCase());
      if (!pair) continue;

      try {
        const [amount0In, amount0Out, amount1Out] = decodeAbiParameters(
          [
            { type: 'uint256' },
            { type: 'uint256' },
            { type: 'uint256' },
            { type: 'uint256' },
          ],
          log.data as `0x${string}`,
        );
        // Use the input side for volume (token0 in if non-zero, else token1 in)
        const amount0 = (amount0In as bigint) > 0n ? -(amount0In as bigint) : (amount0Out as bigint);
        const amount1 = (amount1Out as bigint) > 0n ? -(amount1Out as bigint) : 0n;

        const usd = ctx.swapUsdFromStable(pair.token0, pair.token1, amount0, amount1);
        if (!usd) continue;

        const val = microUsdToUsd(usd.usdMicro);
        const ts = allTimestamps.get(log.blockNumber);
        if (ts === undefined) continue;
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        volumeBuckets.set(date, (volumeBuckets.get(date) ?? 0n) + val);
      } catch {
        // malformed log — skip
      }
    }
  }

  return mapToPoints(volumeBuckets);
}

async function computeFees(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<MetricSeriesPoint[]> {
  const volumePoints = await computeVolume(ctx, range);
  return volumePoints.map((p) => ({
    date: p.date,
    value: ((BigInt(p.value) * FEE_BPS) / 10_000n).toString(),
  }));
}

async function computeTxs(
  ctx: ComputeContext,
  range: BlockRange,
): Promise<MetricSeriesPoint[]> {
  const factory = ctx.chainId === 42161 ? FACTORY_ARB : FACTORY_ETH;
  const pairs = await buildPairRegistry(ctx, factory, range);
  if (!pairs.size) return [];

  const pairAddresses = Array.from(pairs.keys());
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: pairAddresses,
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

  const buckets = countByDay(items, allTimestamps);
  return mapToPoints(buckets);
}

export const uniswapV2Pack: ProtocolPack = {
  id: 'uniswap-v2',
  name: 'Uniswap V2',
  aliases: ['uniswap_v2', 'univ2', 'uniswapv2', 'uniswap v2'],
  chains: {
    '1': { startBlock: 10000835, factories: [FACTORY_ETH] },
    '42161': { startBlock: 222828, factories: [FACTORY_ARB] },
  },
  metrics: {
    volume_usd: {
      id: 'volume_usd',
      label: 'Volume (USD)',
      description: 'Daily trading volume in USD',
      methodology:
        'Stablecoin side of every Swap event on V2 pairs created by the factory. Fixed 0.3% fee excluded from volume.',
      source: 'hypersync',
      unit: 'usd',
      compute: computeVolume,
    },
    fees_usd: {
      id: 'fees_usd',
      label: 'Fees (USD)',
      description: 'Daily protocol fees (0.3% of stablecoin volume)',
      methodology: 'volume_usd × 0.003 (Uniswap V2 fixed fee tier).',
      source: 'hypersync',
      unit: 'usd',
      compute: computeFees,
    },
    txs: {
      id: 'txs',
      label: 'Transactions',
      description: 'Daily swap count on all V2 pairs',
      methodology: 'Count of Swap events across all factory-discovered pairs.',
      source: 'hypersync',
      unit: 'count',
      compute: computeTxs,
    },
  },
};
