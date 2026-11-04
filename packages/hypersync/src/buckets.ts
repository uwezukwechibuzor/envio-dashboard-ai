import { timestampToDate } from './blocks.js';

export type DailyBucket = {
  date: string; // YYYY-MM-DD
  value: bigint;
};

export function bucketByDay(
  items: { blockNumber: number; value: bigint }[],
  blockTimestamps: Map<number, number>,
): Map<string, bigint> {
  const buckets = new Map<string, bigint>();
  for (const item of items) {
    const ts = blockTimestamps.get(item.blockNumber);
    if (ts === undefined) continue;
    const date = timestampToDate(ts);
    buckets.set(date, (buckets.get(date) ?? 0n) + item.value);
  }
  return buckets;
}

export function mergeBuckets(
  ...maps: Map<string, bigint>[]
): Map<string, bigint> {
  const result = new Map<string, bigint>();
  for (const map of maps) {
    for (const [date, value] of map) {
      result.set(date, (result.get(date) ?? 0n) + value);
    }
  }
  return result;
}

/** Convert a bucket map to sorted points without filling missing dates. */
export function mapToPoints(buckets: Map<string, bigint>): { date: string; value: string }[] {
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: value.toString() }));
}

export function bucketsToPoints(
  buckets: Map<string, bigint>,
  fromDate: string,
  toDate: string,
): { date: string; value: string }[] {
  const points: { date: string; value: string }[] = [];
  const current = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);

  while (current <= end) {
    const date = current.toISOString().slice(0, 10);
    points.push({ date, value: (buckets.get(date) ?? 0n).toString() });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return points;
}

export function countByDay(
  items: { blockNumber: number }[],
  blockTimestamps: Map<number, number>,
): Map<string, bigint> {
  const buckets = new Map<string, bigint>();
  for (const item of items) {
    const ts = blockTimestamps.get(item.blockNumber);
    if (ts === undefined) continue;
    const date = timestampToDate(ts);
    buckets.set(date, (buckets.get(date) ?? 0n) + 1n);
  }
  return buckets;
}

export function uniqueByDay(
  items: { blockNumber: number; key: string }[],
  blockTimestamps: Map<number, number>,
): Map<string, bigint> {
  const dailySets = new Map<string, Set<string>>();
  for (const item of items) {
    const ts = blockTimestamps.get(item.blockNumber);
    if (ts === undefined) continue;
    const date = timestampToDate(ts);
    if (!dailySets.has(date)) dailySets.set(date, new Set());
    dailySets.get(date)!.add(item.key);
  }
  const result = new Map<string, bigint>();
  for (const [date, set] of dailySets) {
    result.set(date, BigInt(set.size));
  }
  return result;
}
