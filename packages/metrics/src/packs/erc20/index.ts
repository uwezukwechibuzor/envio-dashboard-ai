import { keccak256, toBytes } from 'viem';
import { streamLogs, bucketByDay, countByDay, uniqueByDay, mapToPoints } from "@envio-dashboard-ai/hypersync";
import type { ProtocolPack, ComputeContext } from '../../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

const TRANSFER_TOPIC0 = keccak256(toBytes('Transfer(address,address,uint256)'));

async function computeTransfers(
  ctx: ComputeContext,
  range: BlockRange,
  tokens: string[],
): Promise<MetricSeriesPoint[]> {
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: tokens,
    topics: [[TRANSFER_TOPIC0]],
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

async function computeVolume(
  ctx: ComputeContext,
  range: BlockRange,
  tokens: string[],
): Promise<MetricSeriesPoint[]> {
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number; value: bigint }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: tokens,
    topics: [[TRANSFER_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber === undefined || !log.data) continue;
      try {
        // Transfer(address indexed from, address indexed to, uint256 value)
        // value is in the data field (not indexed)
        const raw = log.data as string;
        const value = BigInt('0x' + raw.slice(2, 66));
        items.push({ blockNumber: log.blockNumber, value });
      } catch {
        // skip
      }
    }
  }

  return mapToPoints(bucketByDay(items, allTimestamps));
}

async function computeActiveHolders(
  ctx: ComputeContext,
  range: BlockRange,
  tokens: string[],
): Promise<MetricSeriesPoint[]> {
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number; key: string }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses: tokens,
    topics: [[TRANSFER_TOPIC0]],
    fromBlock: range.from,
    toBlock: range.to,
    fieldSelection: { log: ['BlockNumber', 'Topic1', 'Topic2'], block: ['Number', 'Timestamp'] },
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber === undefined) continue;
      if (log.topics[1]) items.push({ blockNumber: log.blockNumber, key: log.topics[1] });
      if (log.topics[2]) items.push({ blockNumber: log.blockNumber, key: log.topics[2] });
    }
  }

  return mapToPoints(uniqueByDay(items, allTimestamps));
}

function makeERC20Pack(
  id: string,
  name: string,
  aliases: string[],
  chainContracts: Record<string, { startBlock: number; contracts: string[] }>,
): ProtocolPack {
  const getTokens = (chainId: number) =>
    chainContracts[String(chainId)]?.contracts ?? [];

  return {
    id,
    name,
    aliases,
    chains: chainContracts,
    metrics: {
      transfers: {
        id: 'transfers',
        label: 'Transfers',
        description: 'Daily number of ERC-20 Transfer events',
        methodology: 'Count of Transfer events on the token contract.',
        source: 'hypersync',
        unit: 'count',
        compute: (ctx, range) => computeTransfers(ctx, range, getTokens(ctx.chainId)),
      },
      volume: {
        id: 'volume',
        label: 'Volume (token units)',
        description: 'Daily sum of transfer amounts (raw token units, not USD)',
        methodology:
          'Sum of the value field from all Transfer events. Amount is in raw ERC-20 units; ' +
          'divide by 10^decimals for human-readable token amounts.',
        source: 'hypersync',
        unit: 'token',
        compute: (ctx, range) => computeVolume(ctx, range, getTokens(ctx.chainId)),
      },
      active_holders: {
        id: 'active_holders',
        label: 'Active Holders',
        description: 'Daily distinct addresses that sent or received tokens',
        methodology:
          'Distinct count of topic1 (from) + topic2 (to) across Transfer events per UTC day.',
        source: 'hypersync',
        unit: 'count',
        compute: (ctx, range) => computeActiveHolders(ctx, range, getTokens(ctx.chainId)),
      },
    },
  };
}

export const erc20Pack = makeERC20Pack(
  'erc20',
  'ERC-20 Token',
  ['erc20', 'eip20', 'token'],
  {
    // No default contracts — users configure addresses via the agent or CLI
  },
);
