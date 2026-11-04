import { z } from 'zod';
import { runMetric } from '@envio-dashboard-ai/metrics';
import {
  EnvConfigSchema,
  UnknownProtocolError,
  UnknownMetricError,
  UnsupportedChainError,
} from '@envio-dashboard-ai/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

function sumPoints(points: { value: string }[]): bigint {
  return points.reduce((acc, p) => acc + BigInt(p.value), 0n);
}

export function registerCompareMetric(server: McpServer): void {
  server.tool(
    'compare_metric',
    'Compare a metric total between two date ranges (baseline vs current). ' +
      'Returns the totals for both periods and the percentage change.',
    {
      protocol: z.string().min(1).describe('Canonical protocol id'),
      metric: z.string().min(1).describe('Metric id from list_metrics'),
      chainId: z.number().int().positive(),
      baselineFrom: z.string().regex(YYYY_MM_DD).describe('Baseline period start, YYYY-MM-DD'),
      baselineTo: z.string().regex(YYYY_MM_DD).describe('Baseline period end, YYYY-MM-DD'),
      currentFrom: z.string().regex(YYYY_MM_DD).describe('Current period start, YYYY-MM-DD'),
      currentTo: z.string().regex(YYYY_MM_DD).describe('Current period end, YYYY-MM-DD'),
    },
    async ({ protocol, metric, chainId, baselineFrom, baselineTo, currentFrom, currentTo }) => {
      let apiToken: string;
      try {
        const env = EnvConfigSchema.parse(process.env);
        apiToken = env.ENVIO_API_TOKEN;
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: { code: 'config_error', message: 'ENVIO_API_TOKEN is not set' },
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const [baseline, current] = await Promise.all([
          runMetric({
            protocol,
            metric,
            chainId,
            dateRange: { from: baselineFrom, to: baselineTo },
            apiToken,
          }),
          runMetric({
            protocol,
            metric,
            chainId,
            dateRange: { from: currentFrom, to: currentTo },
            apiToken,
          }),
        ]);

        const baselineTotal = sumPoints(baseline.points);
        const currentTotal = sumPoints(current.points);

        let pctChange: string | null = null;
        if (baselineTotal !== 0n) {
          const change = ((currentTotal - baselineTotal) * 10000n) / baselineTotal;
          pctChange = (Number(change) / 100).toFixed(2);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                protocol,
                metric,
                chainId,
                unit: baseline.unit,
                baseline: { from: baselineFrom, to: baselineTo, total: baselineTotal.toString() },
                current: { from: currentFrom, to: currentTo, total: currentTotal.toString() },
                pctChange,
                asOfBlock: current.asOfBlock,
              }),
            },
          ],
        };
      } catch (err) {
        if (
          err instanceof UnknownProtocolError ||
          err instanceof UnknownMetricError ||
          err instanceof UnsupportedChainError
        ) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(err.toToolResult()) }],
            isError: true,
          };
        }
        throw err;
      }
    },
  );
}
