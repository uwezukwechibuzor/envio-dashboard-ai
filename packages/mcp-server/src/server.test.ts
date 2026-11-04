import { describe, it, expect } from 'vitest';
import { createServer } from './server.js';

describe('createServer', () => {
  it('creates a McpServer without throwing', async () => {
    // metrics package must be initialized first
    await import('@envio-dashboard-ai/metrics');
    expect(() => createServer()).not.toThrow();
  });

  it('server has all 8 tools registered', async () => {
    await import('@envio-dashboard-ai/metrics');
    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    const expectedTools = [
      'supported_chains',
      'resolve_protocol',
      'list_protocols',
      'list_metrics',
      'get_metric_series',
      'compare_metric',
      'top_accounts',
      'contract_activity',
    ];
    for (const name of expectedTools) {
      expect(tools[name], `tool ${name} not registered`).toBeDefined();
    }
  });
});

describe('resolve_protocol tool', () => {
  it('resolves known protocol', async () => {
    await import('@envio-dashboard-ai/metrics');
    const server = createServer();
    const tool = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })
      ._registeredTools['resolve_protocol'];

    const result = await tool!.handler({ query: 'uniswap v3' });
    const text = (result as { content: { text: string }[] }).content[0]!.text;
    const data = JSON.parse(text);
    expect(data.id).toBe('uniswap-v3');
    expect(Array.isArray(data.chains)).toBe(true);
  });

  it('returns error for unknown protocol', async () => {
    await import('@envio-dashboard-ai/metrics');
    const server = createServer();
    const tool = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })
      ._registeredTools['resolve_protocol'];

    const result = await tool!.handler({ query: 'totally-unknown-protocol-xyz' });
    const r = result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    const data = JSON.parse(r.content[0]!.text);
    expect(data.error).toBeDefined();
    expect(data.error.code).toContain('UNKNOWN');
  });
});

describe('list_protocols tool', () => {
  it('returns protocols including uniswap-v3 and sushiswap-v2', async () => {
    await import('@envio-dashboard-ai/metrics');
    const server = createServer();
    const tool = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })
      ._registeredTools['list_protocols'];

    const result = await tool!.handler({});
    const data = JSON.parse((result as { content: { text: string }[] }).content[0]!.text);
    const ids = data.protocols.map((p: { id: string }) => p.id);
    expect(ids).toContain('uniswap-v3');
    expect(ids).toContain('sushiswap-v2');
    expect(ids).toContain('spark');
  });
});
