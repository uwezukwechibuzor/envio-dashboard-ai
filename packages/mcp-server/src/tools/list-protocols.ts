import { listProtocols } from '@envio-dashboard-ai/metrics';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerListProtocols(server: McpServer): void {
  server.tool(
    'list_protocols',
    'List all registered protocols (built-in packs + fork registry). ' +
      'Returns id, name, supported chains, and available metric ids for each.',
    {},
    async () => {
      const protocols = listProtocols().map((pack) => ({
        id: pack.id,
        name: pack.name,
        aliases: pack.aliases,
        chains: Object.keys(pack.chains).map(Number),
        metrics: Object.keys(pack.metrics),
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ protocols }) }],
      };
    },
  );
}
