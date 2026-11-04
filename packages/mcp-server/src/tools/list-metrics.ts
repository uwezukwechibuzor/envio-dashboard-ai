import { z } from 'zod';
import { resolveProtocol } from '@envio-dashboard-ai/metrics';
import { UnknownProtocolError } from '@envio-dashboard-ai/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerListMetrics(server: McpServer): void {
  server.tool(
    'list_metrics',
    'List all available metrics for a protocol with their descriptions, units, and methodology.',
    {
      protocol: z.string().min(1).describe('Canonical protocol id from resolve_protocol'),
    },
    async ({ protocol }) => {
      try {
        const pack = resolveProtocol(protocol);
        const metrics = Object.values(pack.metrics).map((m) => ({
          id: m.id,
          label: m.label,
          description: m.description,
          methodology: m.methodology,
          unit: m.unit,
          source: m.source,
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ protocol: pack.id, metrics }),
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
