import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { MetricSeriesPoint } from '@envio-dashboard-ai/core';
import { metricSeries } from './db/schema.js';

export type CacheKey = {
  protocol: string;
  chainId: number;
  metric: string;
};

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(databaseUrl: string) {
  if (!_db) {
    const client = postgres(databaseUrl);
    _db = drizzle(client, { schema: { metricSeries } });
  }
  return _db;
}

export async function getCachedPoints(
  db: ReturnType<typeof drizzle>,
  key: CacheKey,
  fromDate: string,
  toDate: string,
): Promise<MetricSeriesPoint[]> {
  const rows = await db
    .select({ date: metricSeries.date, value: metricSeries.value })
    .from(metricSeries)
    .where(
      and(
        eq(metricSeries.protocol, key.protocol),
        eq(metricSeries.chainId, key.chainId),
        eq(metricSeries.metric, key.metric),
        gte(metricSeries.date, fromDate),
        lte(metricSeries.date, toDate),
      ),
    )
    .orderBy(metricSeries.date);

  return rows;
}

export async function upsertPoints(
  db: ReturnType<typeof drizzle>,
  key: CacheKey,
  points: MetricSeriesPoint[],
  source: string,
  asOfBlock: number,
): Promise<void> {
  if (!points.length) return;

  await db
    .insert(metricSeries)
    .values(
      points.map((p) => ({
        protocol: key.protocol,
        chainId: key.chainId,
        metric: key.metric,
        date: p.date,
        value: p.value,
        source,
        asOfBlock,
      })),
    )
    .onConflictDoUpdate({
      target: [metricSeries.protocol, metricSeries.chainId, metricSeries.metric, metricSeries.date],
      set: { value: metricSeries.value, asOfBlock: metricSeries.asOfBlock },
    });
}

export function findMissingDates(
  cached: MetricSeriesPoint[],
  fromDate: string,
  toDate: string,
): string[] {
  const cachedSet = new Set(cached.map((p) => p.date));
  const missing: string[] = [];
  const current = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);

  while (current <= end) {
    const date = current.toISOString().slice(0, 10);
    if (!cachedSet.has(date)) missing.push(date);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return missing;
}
