import type { IncomingMessage } from 'node:http';

export function validateAuth(req: IncomingMessage): boolean {
  const rawKeys = process.env['MCP_API_KEYS'];
  if (!rawKeys) return true; // no auth configured — open access

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  const validKeys = rawKeys
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return validKeys.includes(token);
}
