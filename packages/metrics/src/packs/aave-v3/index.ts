import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, mapToPoints } from "@envio-dashboard-ai/hypersync";
import { isStablecoin } from '../../pricing.js';
import type { ProtocolPack, ComputeContext } from '../../types.js';
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

// Aave V3 Pool addresses
const POOLS: Record<number, string> = {
  1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  8453: '0xA238Dd80C259a72e81d7e4664317d3e4BA565e9b',
  10: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
};

type EventType = 'supply' | 'borrow' | 'liquidation';

async function computeAaveMetric(
  ctx: ComputeContext,
  range: BlockRange,
  eventType: EventType,
  mode: 'count' | 'usd',
): Promise<MetricSeriesPoint[]> {
  const pool = POOLS[ctx.chainId];
  if (!pool) return [];

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
        // Supply/Borrow: data = (uint256 amount, uint16 referral) — amount is first 32 bytes
        // reserve address is topic1 (indexed)
        const reserve = ('0x' + log.topics[1].slice(26)).toLowerCase();
        if (!isStablecoin(ctx.chainId, reserve)) continue;

        const [amount] = decodeAbiParameters(
          [{ type: 'uint256' }],
          ('0x' + (log.data as string).slice(2, 66)) as `0x${string}`,
        );

        // Stablecoin reserve — 6 decimals for USDC/USDT, 18 for DAI
        const decimals = reserve.startsWith('0x6b1') ? 18n : 6n; // DAI vs others (heuristic)
        const usd = (amount as bigint) / 10n ** decimals;
        valueBuckets.set(date, (valueBuckets.get(date) ?? 0n) + usd);
      } catch {
        // malformed — skip
      }
    }
  }

  return mapToPoints(valueBuckets);
}

export const aaveV3Pack: ProtocolPack = {
  id: 'aave-v3',
  name: 'Aave V3',
  aliases: ['aave_v3', 'aavev3', 'aave v3', 'aave3'],
  chains: {
    '1': { startBlock: 16291127, contracts: [POOLS[1]!] },
    '42161': { startBlock: 7742429, contracts: [POOLS[42161]!] },
    '8453': { startBlock: 2357129, contracts: [POOLS[8453]!] },
    '10': { startBlock: 4365693, contracts: [POOLS[10]!] },
  },
  metrics: {
    deposits_usd: {
      id: 'deposits_usd',
      label: 'Deposits (USD)',
      description: 'Daily deposit volume in USD (stablecoin reserves only)',
      methodology:
        'Sum of Supply event amounts for stablecoin reserve addresses on the Aave V3 Pool. ' +
        'Only USDC/USDT/DAI reserves are counted. Non-stable reserves (WETH, WBTC) are excluded.',
      source: 'hypersync',
      unit: 'usd',
      compute: (ctx, range) => computeAaveMetric(ctx, range, 'supply', 'usd'),
    },
    borrows_usd: {
      id: 'borrows_usd',
      label: 'Borrows (USD)',
      description: 'Daily borrow volume in USD (stablecoin reserves only)',
      methodology:
        'Sum of Borrow event amounts for stablecoin reserve addresses on the Aave V3 Pool.',
      source: 'hypersync',
      unit: 'usd',
      compute: (ctx, range) => computeAaveMetric(ctx, range, 'borrow', 'usd'),
    },
    liquidations_count: {
      id: 'liquidations_count',
      label: 'Liquidations',
      description: 'Daily number of liquidation events',
      methodology: 'Count of LiquidationCall events on the Aave V3 Pool.',
      source: 'hypersync',
      unit: 'count',
      compute: (ctx, range) => computeAaveMetric(ctx, range, 'liquidation', 'count'),
    },
    txs: {
      id: 'txs',
      label: 'Transactions',
      description: 'Daily number of Supply + Borrow events',
      methodology:
        'Count of Supply and Borrow events on the Aave V3 Pool (each event = one user action).',
      source: 'hypersync',
      unit: 'count',
      compute: async (ctx, range) => {
        const [supply, borrow] = await Promise.all([
          computeAaveMetric(ctx, range, 'supply', 'count'),
          computeAaveMetric(ctx, range, 'borrow', 'count'),
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
