import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, countByDay, mapToPoints } from '@envio-dashboard-ai/hypersync';
import type { ForkConfig } from '@envio-dashboard-ai/core';
import type { ProtocolPack, ComputeContext } from '../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

// Compound V2 Comptroller
const MARKET_LISTED_TOPIC0 = keccak256(toBytes('MarketListed(address)'));

// CToken events
const MINT_TOPIC0 = keccak256(toBytes('Mint(address,uint256,uint256)'));
const BORROW_TOPIC0 = keccak256(toBytes('Borrow(address,uint256,uint256,uint256)'));

async function discoverCTokens(
  ctx: ComputeContext,
  range: BlockRange,
  comptroller: string,
): Promise<string[]> {
  const cTokens: string[] = [];
  for await (const batch of streamLogs(ctx.client, {
    addresses: [comptroller],
    topics: [[MARKET_LISTED_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const log of batch.logs) {
      if (!log.data) continue;
      try {
        const [cToken] = decodeAbiParameters([{ type: 'address' }], log.data as `0x${string}`);
        cTokens.push((cToken as string).toLowerCase());
      } catch {
        // malformed — skip
      }
    }
  }
  return cTokens;
}

async function computeEventCount(
  ctx: ComputeContext,
  range: BlockRange,
  cTokens: string[],
  topic0: string,
): Promise<MetricSeriesPoint[]> {
  if (!cTokens.length) return [];

  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: cTokens,
    topics: [[topic0]],
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

export function createLendingCompoundPack(config: ForkConfig): ProtocolPack {
  const chains: ProtocolPack['chains'] = {};
  for (const [chainId, chainCfg] of Object.entries(config.chains)) {
    if (chainCfg.comptroller) {
      chains[chainId] = { startBlock: chainCfg.startBlock, contracts: [chainCfg.comptroller] };
    }
  }

  return {
    id: config.id,
    name: config.name,
    aliases: config.aliases,
    chains,
    metrics: {
      supply_txs: {
        id: 'supply_txs',
        label: 'Supply Transactions',
        description: 'Daily count of Mint (supply) events across all cTokens',
        methodology:
          `Count of Mint events on all cTokens discovered via MarketListed from the ` +
          `${config.name} Comptroller. Each Mint event represents one supply action.`,
        source: 'hypersync',
        unit: 'count',
        compute: async (ctx, range) => {
          const comptroller = config.chains[String(ctx.chainId)]?.comptroller;
          if (!comptroller) return [];
          const cTokens = await discoverCTokens(ctx, range, comptroller);
          return computeEventCount(ctx, range, cTokens, MINT_TOPIC0);
        },
      },
      borrow_txs: {
        id: 'borrow_txs',
        label: 'Borrow Transactions',
        description: 'Daily count of Borrow events across all cTokens',
        methodology:
          `Count of Borrow events on all cTokens discovered via MarketListed from the ` +
          `${config.name} Comptroller. Each Borrow event represents one borrow action.`,
        source: 'hypersync',
        unit: 'count',
        compute: async (ctx, range) => {
          const comptroller = config.chains[String(ctx.chainId)]?.comptroller;
          if (!comptroller) return [];
          const cTokens = await discoverCTokens(ctx, range, comptroller);
          return computeEventCount(ctx, range, cTokens, BORROW_TOPIC0);
        },
      },
      txs: {
        id: 'txs',
        label: 'Transactions',
        description: 'Daily total of Mint + Borrow events',
        methodology: `Sum of Mint and Borrow events on all ${config.name} cTokens per UTC day.`,
        source: 'hypersync',
        unit: 'count',
        compute: async (ctx, range) => {
          const comptroller = config.chains[String(ctx.chainId)]?.comptroller;
          if (!comptroller) return [];
          const cTokens = await discoverCTokens(ctx, range, comptroller);
          const [supply, borrow] = await Promise.all([
            computeEventCount(ctx, range, cTokens, MINT_TOPIC0),
            computeEventCount(ctx, range, cTokens, BORROW_TOPIC0),
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
