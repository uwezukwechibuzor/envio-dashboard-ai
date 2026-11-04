import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../server.js';
import { validateAuth } from '../auth.js';
import { RateLimiter } from '../rate-limit.js';

const rateLimiter = new RateLimiter(
  Number(process.env['MCP_RATE_LIMIT_MAX'] ?? 60),
  Number(process.env['MCP_RATE_LIMIT_WINDOW_MS'] ?? 60_000),
);

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return req.socket.remoteAddress ?? 'unknown';
}

function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message } }));
}

export async function startHttp(port: number): Promise<void> {
  // Import metrics package to register all packs and forks
  await import('@envio-dashboard-ai/metrics');

  const mcpServer = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== '/mcp') {
      sendError(res, 404, 'not_found', 'Only POST /mcp is supported');
      return;
    }
    if (req.method !== 'POST') {
      sendError(res, 405, 'method_not_allowed', 'Only POST is supported');
      return;
    }

    const ip = getClientIp(req);
    if (!rateLimiter.check(ip)) {
      sendError(res, 429, 'rate_limited', 'Too many requests');
      return;
    }

    if (!validateAuth(req)) {
      sendError(res, 401, 'unauthorized', 'Invalid or missing API key');
      return;
    }

    // Collect body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      sendError(res, 400, 'bad_request', 'Invalid JSON body');
      return;
    }

    await transport.handleRequest(req, res, parsedBody);
  });

  httpServer.listen(port, () => {
    // Server started — log to stderr so stdout remains clean for stdio transport consumers
    process.stderr.write(`envio-data-mcp HTTP server listening on port ${port}\n`);
  });
}
