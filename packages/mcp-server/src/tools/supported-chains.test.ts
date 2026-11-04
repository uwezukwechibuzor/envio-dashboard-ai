import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSupportedChains } from './supported-chains.js';

function makeServer(): McpServer {
  return new McpServer({ name: 'test', version: '0.0.1' });
}

describe('supported_chains tool', () => {
  it('registers without error', () => {
    const server = makeServer();
    expect(() => registerSupportedChains(server)).not.toThrow();
  });

  it('tool returns chains including Ethereum', async () => {
    const server = makeServer();
    registerSupportedChains(server);

    const handler = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })
      ._registeredTools['supported_chains'];
    expect(handler).toBeDefined();

    const result = await handler!.handler({});
    const content = (result as { content: { text: string }[] }).content[0];
    expect(content).toBeDefined();
    const data = JSON.parse(content!.text);
    expect(Array.isArray(data.chains)).toBe(true);
    const eth = data.chains.find((c: { chainId: number }) => c.chainId === 1);
    expect(eth).toBeDefined();
    expect(eth.name).toBe('ethereum');
  });

  it('all returned chains have chainId, name, url', async () => {
    const server = makeServer();
    registerSupportedChains(server);

    const handler = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })
      ._registeredTools['supported_chains'];
    const result = await handler!.handler({});
    const data = JSON.parse((result as { content: { text: string }[] }).content[0]!.text);
    for (const chain of data.chains) {
      expect(chain.chainId).toBeTypeOf('number');
      expect(chain.name).toBeTypeOf('string');
      expect(chain.url).toBeTypeOf('string');
    }
  });
});
