import { CHAINS } from '@envio-dashboard-ai/hypersync';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerSupportedChains(server: McpServer): void {
  server.tool(
    'supported_chains',
    'List all EVM chains supported by HyperSync with their chain IDs and names.',
    {},
    async () => {
      const chains = Object.values(CHAINS).map((c) => ({
        chainId: c.id,
        name: c.name,
        url: c.url,
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ chains }) }],
      };
    },
  );
}
