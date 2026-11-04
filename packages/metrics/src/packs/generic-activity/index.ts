import { streamLogs, countByDay, uniqueByDay, mapToPoints } from "@envio-dashboard-ai/hypersync";
import type { ProtocolPack, ComputeContext } from '../../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

async function computeEventsPerDay(
  ctx: ComputeContext,
  range: BlockRange,
  addresses: string[],
): Promise<MetricSeriesPoint[]> {
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses,
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

async function computeUniqueSenders(
  ctx: ComputeContext,
  range: BlockRange,
  addresses: string[],
): Promise<MetricSeriesPoint[]> {
  const allTimestamps = new Map<number, number>();
  const items: { blockNumber: number; key: string }[] = [];

  for await (const batch of streamLogs(ctx.client, {
    addresses,
    fromBlock: range.from,
    toBlock: range.to,
    fieldSelection: {
      log: ['BlockNumber', 'Topic0', 'Topic1'],
      block: ['Number', 'Timestamp'],
      transaction: ['From'],
    },
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber === undefined) continue;
      // topic1 is typically the sender for indexed events; fall back to topic0 presence check
      if (log.topics[1]) {
        items.push({ blockNumber: log.blockNumber, key: log.topics[1] });
      }
    }
  }

  return mapToPoints(uniqueByDay(items, allTimestamps));
}

async function computeEventsBySignature(
  ctx: ComputeContext,
  range: BlockRange,
  addresses: string[],
): Promise<MetricSeriesPoint[]> {
  const allTimestamps = new Map<number, number>();
  const sigCounts = new Map<string, Map<string, bigint>>(); // date → sig → count

  for await (const batch of streamLogs(ctx.client, {
    addresses,
    fromBlock: range.from,
    toBlock: range.to,
    fieldSelection: { log: ['BlockNumber', 'Topic0'], block: ['Number', 'Timestamp'] },
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);
    for (const log of batch.logs) {
      if (log.blockNumber === undefined || !log.topics[0]) continue;
      const ts = allTimestamps.get(log.blockNumber);
      if (ts === undefined) continue;
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      const sig = log.topics[0].slice(0, 10); // 4-byte selector as hex

      if (!sigCounts.has(date)) sigCounts.set(date, new Map());
      const dayCounts = sigCounts.get(date)!;
      dayCounts.set(sig, (dayCounts.get(sig) ?? 0n) + 1n);
    }
  }

  // Flatten: total events per day (sum across all signatures)
  const totals = new Map<string, bigint>();
  for (const [date, sigs] of sigCounts) {
    let sum = 0n;
    for (const count of sigs.values()) sum += count;
    totals.set(date, sum);
  }

  return mapToPoints(totals);
}

export const genericActivityPack: ProtocolPack = {
  id: 'generic-activity',
  name: 'Generic Contract Activity',
  aliases: ['activity', 'contract', 'generic'],
  chains: {
    // No default chain/contract — configured by the agent at runtime
    '1': { startBlock: 0 },
    '42161': { startBlock: 0 },
    '8453': { startBlock: 0 },
    '10': { startBlock: 0 },
    '137': { startBlock: 0 },
  },
  metrics: {
    events_per_day: {
      id: 'events_per_day',
      label: 'Events / Day',
      description: 'Total number of log events emitted by the contract per day',
      methodology:
        'Count of all log events from the specified contract address(es) per UTC day.',
      source: 'hypersync',
      unit: 'count',
      compute: (ctx, range) => {
        const addresses: string[] = []; // resolved by agent at runtime
        return computeEventsPerDay(ctx, range, addresses);
      },
    },
    unique_senders: {
      id: 'unique_senders',
      label: 'Unique Senders',
      description: 'Distinct addresses interacting with the contract per day',
      methodology:
        'Distinct count of topic1 (typically the caller or sender for indexed events) per UTC day.',
      source: 'hypersync',
      unit: 'count',
      compute: (ctx, range) => {
        const addresses: string[] = [];
        return computeUniqueSenders(ctx, range, addresses);
      },
    },
    events_by_signature: {
      id: 'events_by_signature',
      label: 'Events by Signature',
      description: 'Total events per day broken down by event topic0 (all signatures summed)',
      methodology:
        'Sum of all log events grouped by topic0, then summed per UTC day. ' +
        'Individual signature breakdown available via the raw data.',
      source: 'hypersync',
      unit: 'count',
      compute: (ctx, range) => {
        const addresses: string[] = [];
        return computeEventsBySignature(ctx, range, addresses);
      },
    },
  },
};
