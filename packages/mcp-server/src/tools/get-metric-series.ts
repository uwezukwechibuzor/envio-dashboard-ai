import { z } from 'zod';
import { runMetric } from '@envio-dashboard-ai/metrics';
import {
  EnvConfigSchema,
  UnknownProtocolError,
  UnknownMetricError,
  UnsupportedChainError,
  UpstreamError,
} from '@envio-dashboard-ai/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function registerGetMetricSeries(server: McpServer): void {
  server.tool(
    'get_metric_series',
    'Fetch a daily time-series for a single metric. ' +
      'Returns one data point per day between fromDate and toDate (inclusive). ' +
      'All values are BigInt-safe decimal strings. ' +
      'Shows asOfBlock so the caller can display data freshness.',
    {
      protocol: z.string().min(1).describe('Canonical protocol id'),
      metric: z.string().min(1).describe('Metric id from list_metrics'),
      chainId: z.number().int().positive().describe('EVM chain id, e.g. 1 for Ethereum'),
      fromDate: z
        .string()
        .regex(YYYY_MM_DD)
        .describe('Start date inclusive, YYYY-MM-DD UTC'),
      toDate: z
        .string()
        .regex(YYYY_MM_DD)
        .describe('End date inclusive, YYYY-MM-DD UTC'),
    },
    async ({ protocol, metric, chainId, fromDate, toDate }) => {
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
                error: {
                  code: 'config_error',
                  message: 'ENVIO_API_TOKEN is not set',
                  hint: 'Set ENVIO_API_TOKEN in the server environment before starting',
                },
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const series = await runMetric({
          protocol,
          metric,
          chainId,
          dateRange: { from: fromDate, to: toDate },
          apiToken,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(series) }],
        };
      } catch (err) {
        if (
          err instanceof UnknownProtocolError ||
          err instanceof UnknownMetricError ||
          err instanceof UnsupportedChainError ||
          err instanceof UpstreamError
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
