#!/usr/bin/env node
export type {}; // marks this as an ES module for TypeScript
/**
 * envio-data-mcp — MCP server entry point.
 *
 * Stdio mode (default):
 *   npx envio-data-mcp
 *   claude mcp add envio-data -- npx envio-data-mcp
 *
 * HTTP mode:
 *   MCP_PORT=3001 npx envio-data-mcp --http
 *
 * Required env:
 *   ENVIO_API_TOKEN  — HyperSync API token (create at envio.dev/app/api-tokens)
 *
 * Optional env:
 *   MCP_API_KEYS       — comma-separated bearer tokens for HTTP auth
 *   MCP_PORT           — HTTP port (default 3001)
 *   MCP_RATE_LIMIT_MAX — max requests per window per IP (default 60)
 *   MCP_RATE_LIMIT_WINDOW_MS — rate limit window in ms (default 60000)
 */
const httpFlag = process.argv.includes('--http');

if (httpFlag) {
  const { startHttp } = await import('../transports/http.js');
  const port = Number(process.env['MCP_PORT'] ?? 3001);
  await startHttp(port);
} else {
  const { startStdio } = await import('../transports/stdio.js');
  await startStdio();
}
