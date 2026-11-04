import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server.js';

export async function startStdio(): Promise<void> {
  // Import metrics package to register all packs and forks
  await import('@envio-dashboard-ai/metrics');

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
