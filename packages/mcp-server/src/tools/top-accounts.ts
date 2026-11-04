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

export function registerTopAccounts(server: McpServer): void {
  server.tool(
    'top_accounts',
    'Return the top accounts (by event count) that interacted with one or more contracts ' +
      'in a given date range. Uses topic1 of each log event as the account identifier ' +
      '(works for indexed sender/from fields).',
    {
      addresses: z
        .array(z.string().regex(HEX_ADDRESS))
        .min(1)
        .max(20)
        .describe('Contract address(es) to query'),
      chainId: z.number().int().positive(),
      fromDate: z.string().regex(YYYY_MM_DD),
      toDate: z.string().regex(YYYY_MM_DD),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .default(20)
        .describe('Maximum number of accounts to return'),
    },
    async ({ addresses, chainId, fromDate, toDate, limit }) => {
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

        const counts = new Map<string, number>();

        for await (const batch of streamLogs(client, {
          addresses,
          fromBlock: blockRange.from,
          toBlock: blockRange.to,
          fieldSelection: { log: ['Topic1'], block: ['Number'] },
        })) {
          for (const log of batch.logs) {
            const account = log.topics[1];
            if (!account) continue;
            const addr = ('0x' + account.slice(26)).toLowerCase();
            counts.set(addr, (counts.get(addr) ?? 0) + 1);
          }
        }

        const sorted = Array.from(counts.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, limit)
          .map(([address, eventCount]) => ({ address, eventCount }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                chainId,
                fromDate,
                toDate,
                accounts: sorted,
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
