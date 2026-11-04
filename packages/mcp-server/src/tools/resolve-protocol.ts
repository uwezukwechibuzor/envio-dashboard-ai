import { z } from 'zod';
import { resolveProtocol } from '@envio-dashboard-ai/metrics';
import { UnknownProtocolError } from '@envio-dashboard-ai/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerResolveProtocol(server: McpServer): void {
  server.tool(
    'resolve_protocol',
    'Resolve a free-text protocol name to its canonical id. ' +
      'Always call this first before fetching metrics — it confirms the protocol is supported ' +
      'and returns the exact id to use in subsequent calls.',
    {
      query: z
        .string()
        .min(1)
        .describe('Protocol name or alias, e.g. "uniswap v3", "univ3", "sushi"'),
    },
    async ({ query }) => {
      try {
        const pack = resolveProtocol(query);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                id: pack.id,
                name: pack.name,
                aliases: pack.aliases,
                chains: Object.keys(pack.chains).map(Number),
              }),
            },
          ],
        };
      } catch (err) {
        if (err instanceof UnknownProtocolError) {
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
