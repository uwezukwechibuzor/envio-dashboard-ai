import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSupportedChains } from './tools/supported-chains.js';
import { registerResolveProtocol } from './tools/resolve-protocol.js';
import { registerListProtocols } from './tools/list-protocols.js';
import { registerListMetrics } from './tools/list-metrics.js';
import { registerGetMetricSeries } from './tools/get-metric-series.js';
import { registerCompareMetric } from './tools/compare-metric.js';
import { registerTopAccounts } from './tools/top-accounts.js';
import { registerContractActivity } from './tools/contract-activity.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'envio-data-mcp',
    version: '0.1.0',
  });

  registerSupportedChains(server);
  registerResolveProtocol(server);
  registerListProtocols(server);
  registerListMetrics(server);
  registerGetMetricSeries(server);
  registerCompareMetric(server);
  registerTopAccounts(server);
  registerContractActivity(server);

  return server;
}
