import { z } from 'zod';
import {
  createHypersyncClient,
  streamLogs,
  dateRangeToBlockRange,
} from '@envio-dashboard-ai/hypersync';
import { EnvConfigSchema } from '@envio-dashboard-ai/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function registerContractActivity(server: McpServer): void {
  server.tool(
    'contract_activity',
    'Fetch daily event counts for one or more contract addresses. ' +
      'Useful for dashboards showing "how active is this contract?" over time.',
    {
      addresses: z
        .array(z.string().regex(HEX_ADDRESS))
        .min(1)
        .max(20)
        .describe('Contract address(es) to query'),
      chainId: z.number().int().positive(),
      fromDate: z.string().regex(YYYY_MM_DD),
      toDate: z.string().regex(YYYY_MM_DD),
    },
    async ({ addresses, chainId, fromDate, toDate }) => {
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
        const client = createHypersyncClient(chainId, apiToken);
        const blockRange = await dateRangeToBlockRange(client, fromDate, toDate, chainId);

        const dailyCounts = new Map<string, bigint>();
        const blockTimestamps = new Map<number, number>();

        for await (const batch of streamLogs(client, {
          addresses,
          fromBlock: blockRange.from,
          toBlock: blockRange.to,
          fieldSelection: { log: ['BlockNumber'], block: ['Number', 'Timestamp'] },
        })) {
          for (const [k, v] of batch.blockTimestamps) blockTimestamps.set(k, v);
          for (const log of batch.logs) {
            if (log.blockNumber === undefined) continue;
            const ts = blockTimestamps.get(log.blockNumber);
            if (ts === undefined) continue;
            const date = new Date(ts * 1000).toISOString().slice(0, 10);
            dailyCounts.set(date, (dailyCounts.get(date) ?? 0n) + 1n);
          }
        }

        const points = Array.from(dailyCounts.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, value: count.toString() }));

        const archiveHeight = await client.getHeight();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                chainId,
                addresses,
                fromDate,
                toDate,
                points,
                asOfBlock: archiveHeight,
              }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: {
                  code: 'upstream_error',
                  message: err instanceof Error ? err.message : String(err),
                },
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
