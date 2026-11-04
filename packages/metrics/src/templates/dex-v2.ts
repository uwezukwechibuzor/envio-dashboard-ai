import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, countByDay, mapToPoints } from '@envio-dashboard-ai/hypersync';
import { microUsdToUsd } from '../pricing.js';
import type { ForkConfig } from '@envio-dashboard-ai/core';
import type { ProtocolPack, ComputeContext } from '../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

const PAIR_CREATED_TOPIC0 = keccak256(toBytes('PairCreated(address,address,address,uint256)'));
const SWAP_TOPIC0 = keccak256(
  toBytes('Swap(address,uint256,uint256,uint256,uint256,address)'),
);

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
  factory: string,
): Promise<MetricSeriesPoint[]> {
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
        const amount0 =
          (amount0In as bigint) > 0n ? -(amount0In as bigint) : (amount0Out as bigint);
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
  factory: string,
  feeBps: bigint,
): Promise<MetricSeriesPoint[]> {
  const volumePoints = await computeVolume(ctx, range, factory);
  return volumePoints.map((p) => ({
    date: p.date,
    value: ((BigInt(p.value) * feeBps) / 10_000n).toString(),
  }));
}

async function computeTxs(
  ctx: ComputeContext,
  range: BlockRange,
  factory: string,
): Promise<MetricSeriesPoint[]> {
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

  return mapToPoints(countByDay(items, allTimestamps));
}

export function createDexV2Pack(config: ForkConfig): ProtocolPack {
  const feeBps = BigInt(config.feeBps ?? 30);

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
          `Stablecoin side of every Swap event on V2 pairs created by the ${config.name} factory. ` +
          `Fixed ${config.feeBps ?? 30} bps fee excluded from volume.`,
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
        description: `Daily protocol fees (${config.feeBps ?? 30} bps of stablecoin volume)`,
        methodology: `volume_usd × ${(config.feeBps ?? 30) / 10000} (${config.name} fee tier).`,
        source: 'hypersync',
        unit: 'usd',
        compute: (ctx, range) => {
          const factory = config.chains[String(ctx.chainId)]?.factory;
          if (!factory) return Promise.resolve([]);
          return computeFees(ctx, range, factory, feeBps);
        },
      },
      txs: {
        id: 'txs',
        label: 'Transactions',
        description: `Daily swap count on all ${config.name} pairs`,
        methodology: `Count of Swap events across all factory-discovered ${config.name} pairs.`,
        source: 'hypersync',
        unit: 'count',
        compute: (ctx, range) => {
          const factory = config.chains[String(ctx.chainId)]?.factory;
          if (!factory) return Promise.resolve([]);
          return computeTxs(ctx, range, factory);
        },
      },
    },
  };
}
