import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, mapToPoints } from '@envio-dashboard-ai/hypersync';
import { isStablecoin } from '../pricing.js';
import type { ForkConfig } from '@envio-dashboard-ai/core';
import type { ProtocolPack, ComputeContext } from '../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

const SUPPLY_TOPIC0 = keccak256(
  toBytes('Supply(address,address,address,uint256,uint16)'),
);
const BORROW_TOPIC0 = keccak256(
  toBytes('Borrow(address,address,address,uint256,uint8,uint256,uint16)'),
);
const LIQUIDATION_TOPIC0 = keccak256(
  toBytes('LiquidationCall(address,address,address,uint256,uint256,address,bool)'),
);

type EventType = 'supply' | 'borrow' | 'liquidation';

async function computeAaveMetric(
  ctx: ComputeContext,
  range: BlockRange,
  pool: string,
  eventType: EventType,
  mode: 'count' | 'usd',
): Promise<MetricSeriesPoint[]> {
  const topic0 =
    eventType === 'supply'
      ? SUPPLY_TOPIC0
      : eventType === 'borrow'
        ? BORROW_TOPIC0
        : LIQUIDATION_TOPIC0;

  const valueBuckets = new Map<string, bigint>();
  const allTimestamps = new Map<number, number>();

  for await (const batch of streamLogs(ctx.client, {
    addresses: [pool],
    topics: [[topic0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);

    for (const log of batch.logs) {
      if (!log.data || log.blockNumber === undefined || !log.topics[1]) continue;

      const ts = allTimestamps.get(log.blockNumber);
      if (ts === undefined) continue;
      const date = new Date(ts * 1000).toISOString().slice(0, 10);

      if (mode === 'count') {
        valueBuckets.set(date, (valueBuckets.get(date) ?? 0n) + 1n);
        continue;
      }

      try {
        const reserve = ('0x' + log.topics[1].slice(26)).toLowerCase();
        if (!isStablecoin(ctx.chainId, reserve)) continue;

        const [amount] = decodeAbiParameters(
          [{ type: 'uint256' }],
          ('0x' + (log.data as string).slice(2, 66)) as `0x${string}`,
        );

        // DAI uses 18 decimals; USDC/USDT use 6
        const decimals = reserve.startsWith('0x6b1') ? 18n : 6n;
        const usd = (amount as bigint) / 10n ** decimals;
        valueBuckets.set(date, (valueBuckets.get(date) ?? 0n) + usd);
      } catch {
        // malformed — skip
      }
    }
  }

  return mapToPoints(valueBuckets);
}

export function createLendingAavePack(config: ForkConfig): ProtocolPack {
  const chains: ProtocolPack['chains'] = {};
  for (const [chainId, chainCfg] of Object.entries(config.chains)) {
    if (chainCfg.pool) {
      chains[chainId] = { startBlock: chainCfg.startBlock, contracts: [chainCfg.pool] };
    }
  }

  return {
    id: config.id,
    name: config.name,
    aliases: config.aliases,
    chains,
    metrics: {
      deposits_usd: {
        id: 'deposits_usd',
        label: 'Deposits (USD)',
        description: 'Daily deposit volume in USD (stablecoin reserves only)',
        methodology:
          `Sum of Supply event amounts for stablecoin reserve addresses on the ${config.name} Pool. ` +
          'Only USDC/USDT/DAI reserves are counted. Non-stable reserves excluded.',
        source: 'hypersync',
        unit: 'usd',
        compute: (ctx, range) => {
          const pool = config.chains[String(ctx.chainId)]?.pool;
          if (!pool) return Promise.resolve([]);
          return computeAaveMetric(ctx, range, pool, 'supply', 'usd');
        },
      },
      borrows_usd: {
        id: 'borrows_usd',
        label: 'Borrows (USD)',
        description: 'Daily borrow volume in USD (stablecoin reserves only)',
        methodology:
          `Sum of Borrow event amounts for stablecoin reserve addresses on the ${config.name} Pool.`,
        source: 'hypersync',
        unit: 'usd',
        compute: (ctx, range) => {
          const pool = config.chains[String(ctx.chainId)]?.pool;
          if (!pool) return Promise.resolve([]);
          return computeAaveMetric(ctx, range, pool, 'borrow', 'usd');
        },
      },
      liquidations_count: {
        id: 'liquidations_count',
        label: 'Liquidations',
        description: 'Daily number of liquidation events',
        methodology: `Count of LiquidationCall events on the ${config.name} Pool.`,
        source: 'hypersync',
        unit: 'count',
        compute: (ctx, range) => {
          const pool = config.chains[String(ctx.chainId)]?.pool;
          if (!pool) return Promise.resolve([]);
          return computeAaveMetric(ctx, range, pool, 'liquidation', 'count');
        },
      },
      txs: {
        id: 'txs',
        label: 'Transactions',
        description: 'Daily Supply + Borrow event count',
        methodology: `Count of Supply and Borrow events on the ${config.name} Pool.`,
        source: 'hypersync',
        unit: 'count',
        compute: async (ctx, range) => {
          const pool = config.chains[String(ctx.chainId)]?.pool;
          if (!pool) return [];
          const [supply, borrow] = await Promise.all([
            computeAaveMetric(ctx, range, pool, 'supply', 'count'),
            computeAaveMetric(ctx, range, pool, 'borrow', 'count'),
          ]);
          const merged = new Map<string, bigint>();
          for (const p of [...supply, ...borrow]) {
            merged.set(p.date, (merged.get(p.date) ?? 0n) + BigInt(p.value));
          }
          return Array.from(merged.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, value]) => ({ date, value: value.toString() }));
        },
      },
    },
  };
}
