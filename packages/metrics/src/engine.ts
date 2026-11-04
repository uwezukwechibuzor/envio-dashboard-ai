import { createHypersyncClient, dateRangeToBlockRange, bucketsToPoints } from '@envio-dashboard-ai/hypersync';
import {
  UnsupportedChainError,
  UnknownMetricError,
  type MetricSeries,
  type DateRange,
} from '@envio-dashboard-ai/core';
import { resolveProtocol } from './registry.js';
import { swapUsdFromStable } from './pricing.js';
import type { ComputeContext } from './types.js';

export type RunMetricOptions = {
  protocol: string;
  metric: string;
  chainId: number;
  dateRange: DateRange;
  apiToken: string;
};

export async function runMetric(opts: RunMetricOptions): Promise<MetricSeries> {
  const pack = resolveProtocol(opts.protocol);

  const chainEntry = pack.chains[String(opts.chainId)];
  if (!chainEntry) throw new UnsupportedChainError(opts.chainId, pack.id);

  const metricEntry = pack.metrics[opts.metric];
  if (!metricEntry) throw new UnknownMetricError(opts.metric, pack.id);

  const client = createHypersyncClient(opts.chainId, opts.apiToken);

  const blockRange = await dateRangeToBlockRange(
    client,
    opts.dateRange.from,
    opts.dateRange.to,
    opts.chainId,
  );

  const ctx: ComputeContext = {
    chainId: opts.chainId,
    client,
    swapUsdFromStable: (token0, token1, amount0, amount1) =>
      swapUsdFromStable(opts.chainId, token0, token1, amount0, amount1),
  };

  const points = await metricEntry.compute(ctx, blockRange);

  // Fill any missing dates in the range with zero
  const pointMap = new Map(points.map((p) => [p.date, p.value]));
  const filled = bucketsToPoints(
    new Map([...pointMap].map(([k, v]) => [k, BigInt(v)])),
    opts.dateRange.from,
    opts.dateRange.to,
  );

  const archiveHeight = await client.getHeight();

  return {
    protocol: pack.id,
    chain: opts.chainId,
    metric: opts.metric,
    unit: metricEntry.unit,
    points: filled,
    asOfBlock: archiveHeight,
    asOfTimestamp: Math.floor(Date.now() / 1000),
    source: metricEntry.source,
    methodology: metricEntry.methodology,
  };
}
