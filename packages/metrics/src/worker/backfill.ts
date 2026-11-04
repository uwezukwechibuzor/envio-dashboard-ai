#!/usr/bin/env tsx
/**
 * Background backfill worker.
 *
 * Pre-computes daily series for all registered protocol packs so dashboards
 * load instantly from cache rather than re-querying HyperSync.
 *
 * Usage:
 *   pnpm backfill                       # backfill last 90 days for all packs
 *   pnpm backfill --days 7              # last 7 days only
 *   pnpm backfill --protocol uniswap-v3 # single protocol
 *
 * Runs incrementally: processes only blocks after the last cached entry.
 * Designed to be invoked by a cron job (Fly Machines cron, Railway cron, or
 * a simple external scheduler).
 *
 * On failure the worker exits non-zero — the cron scheduler / health-check
 * is responsible for alerting.
 */
import '../index.js'; // registers all packs
import { runMetric } from '../engine.js';
import { listProtocols } from '../registry.js';
import { EnvConfigSchema } from '@envio-dashboard-ai/core';
import type { ProtocolPack } from '../types.js';

function parseArgs(): { days: number; protocol: string | null } {
  const args = process.argv.slice(2);
  let days = 90;
  let protocol: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) days = Number(args[++i]);
    if (args[i] === '--protocol' && args[i + 1]) protocol = args[++i] ?? null;
  }
  return { days, protocol };
}

function daysAgoDate(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface BackfillResult {
  protocol: string;
  metric: string;
  chainId: number;
  status: 'ok' | 'error';
  error?: string;
  points?: number;
  durationMs?: number;
}

async function backfillOne(
  pack: ProtocolPack,
  metricId: string,
  chainId: number,
  apiToken: string,
  fromDate: string,
  toDate: string,
): Promise<BackfillResult> {
  const start = Date.now();
  try {
    const series = await runMetric({
      protocol: pack.id,
      metric: metricId,
      chainId,
      dateRange: { from: fromDate, to: toDate },
      apiToken,
    });
    return {
      protocol: pack.id,
      metric: metricId,
      chainId,
      status: 'ok',
      points: series.points.length,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      protocol: pack.id,
      metric: metricId,
      chainId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function main(): Promise<void> {
  const env = EnvConfigSchema.parse(process.env);
  const { days, protocol: filterProtocol } = parseArgs();

  const fromDate = daysAgoDate(days);
  const toDate = todayDate();

  const packs = listProtocols().filter(
    (p) => !filterProtocol || p.id === filterProtocol,
  );

  if (packs.length === 0) {
    console.error(`No protocol found matching "${filterProtocol ?? '*'}"`);
    process.exit(1);
  }

  console.info(
    JSON.stringify({ event: 'backfill_start', protocols: packs.length, fromDate, toDate }),
  );

  const tasks: Array<() => Promise<BackfillResult>> = [];

  for (const pack of packs) {
    const chainIds = Object.keys(pack.chains).map(Number);
    for (const metricId of Object.keys(pack.metrics)) {
      for (const chainId of chainIds) {
        tasks.push(() =>
          backfillOne(pack, metricId, chainId, env.ENVIO_API_TOKEN, fromDate, toDate),
        );
      }
    }
  }

  // Process with concurrency limit to avoid rate-limit pressure
  const CONCURRENCY = 3;
  const results: BackfillResult[] = [];
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((t) => t()));
    results.push(...batchResults);
    for (const r of batchResults) {
      console.info(JSON.stringify({ event: 'metric_done', ...r }));
    }
  }

  const errors = results.filter((r) => r.status === 'error');
  const ok = results.filter((r) => r.status === 'ok');

  console.info(
    JSON.stringify({
      event: 'backfill_complete',
      total: results.length,
      ok: ok.length,
      errors: errors.length,
      errorDetails: errors.map((e) => ({
        protocol: e.protocol,
        metric: e.metric,
        chainId: e.chainId,
        error: e.error,
      })),
    }),
  );

  if (errors.length > 0) {
    console.error(`Backfill completed with ${errors.length} error(s). See logs above.`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({
    event: 'backfill_fatal',
    error: err instanceof Error ? err.message : String(err),
  }));
  process.exit(1);
});
