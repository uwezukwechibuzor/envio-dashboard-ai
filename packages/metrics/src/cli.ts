#!/usr/bin/env tsx
/**
 * Dev CLI: pnpm metric <pack> <metric> --chain <chainId> --days <n>
 *
 * Example:
 *   pnpm metric uniswap-v3 fees_usd --chain 42161 --days 30
 */
import { EnvConfigSchema } from '@envio-dashboard-ai/core';
import './index.js'; // registers all packs
import { runMetric } from './engine.js';

function parseArgs(): {
  protocol: string;
  metric: string;
  chainId: number;
  days: number;
} {
  const args = process.argv.slice(2);
  const protocol = args[0];
  const metric = args[1];
  if (!protocol || !metric) {
    console.error('Usage: pnpm metric <protocol> <metric> --chain <chainId> --days <n>');
    process.exit(1);
  }

  let chainId = 1;
  let days = 7;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--chain' && args[i + 1]) chainId = Number(args[++i]);
    if (args[i] === '--days' && args[i + 1]) days = Number(args[++i]);
  }

  return { protocol, metric, chainId, days };
}

function daysAgoDate(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const env = EnvConfigSchema.parse(process.env);
  const { protocol, metric, chainId, days } = parseArgs();

  const fromDate = daysAgoDate(days);
  const toDate = todayDate();

  console.info(`Fetching ${protocol}/${metric} on chain ${chainId} from ${fromDate} to ${toDate}…`);
  const start = Date.now();

  const series = await runMetric({
    protocol,
    metric,
    chainId,
    dateRange: { from: fromDate, to: toDate },
    apiToken: env.ENVIO_API_TOKEN,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.info(`\nProtocol : ${series.protocol}`);
  console.info(`Metric   : ${series.metric} (${series.unit})`);
  console.info(`Chain    : ${series.chain}`);
  console.info(`Source   : ${series.source}`);
  console.info(`As of    : block ${series.asOfBlock}`);
  console.info(`Elapsed  : ${elapsed}s\n`);
  console.info('Date        | Value');
  console.info('------------|------------------');
  for (const p of series.points) {
    const val = BigInt(p.value).toLocaleString();
    console.info(`${p.date} | ${val}`);
  }
  console.info(`\nMethodology: ${series.methodology}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
