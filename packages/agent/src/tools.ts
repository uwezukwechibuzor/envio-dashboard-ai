import type Anthropic from '@anthropic-ai/sdk';
import { resolveProtocol, listProtocols, runMetric } from '@envio-dashboard-ai/metrics';
import { createHypersyncClient, streamLogs, dateRangeToBlockRange, CHAINS } from '@envio-dashboard-ai/hypersync';
import { EnvConfigSchema, UnknownProtocolError, UnknownMetricError, UnsupportedChainError } from '@envio-dashboard-ai/core';
import { wrapToolResult } from './safety.js';

export type ToolResult = { content: string; isError: boolean };
export type ToolExecutor = (input: Record<string, unknown>) => Promise<ToolResult>;

function ok(data: unknown): ToolResult {
  return { content: JSON.stringify(data), isError: false };
}

function toolErr(code: string, message: string, hint?: string): ToolResult {
  return {
    content: JSON.stringify({ error: { code, message, hint } }),
    isError: true,
  };
}

function getApiToken(): string | null {
  try {
    return EnvConfigSchema.parse(process.env).ENVIO_API_TOKEN;
  } catch {
    return null;
  }
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function assertDate(v: unknown, name: string): string {
  if (typeof v !== 'string' || !YYYY_MM_DD.test(v)) throw new Error(`${name} must be YYYY-MM-DD`);
  return v;
}
function assertStr(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v) throw new Error(`${name} must be a non-empty string`);
  return v;
}
function assertInt(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

export const TOOL_EXECUTORS: Map<string, ToolExecutor> = new Map([
  [
    'supported_chains',
    async () => {
      const chains = Object.values(CHAINS).map((c) => ({
        chainId: c.id,
        name: c.name,
        url: c.url,
      }));
      return ok({ chains });
    },
  ],
  [
    'resolve_protocol',
    async (input: Record<string, unknown>) => {
      try {
        const query = assertStr(input['query'], 'query');
        const pack = resolveProtocol(query);
        return ok({
          id: pack.id,
          name: pack.name,
          aliases: pack.aliases,
          chains: Object.keys(pack.chains).map(Number),
        });
      } catch (err) {
        if (err instanceof UnknownProtocolError) return toolErr(err.code, err.message, err.hint);
        return toolErr('RESOLVE_ERROR', err instanceof Error ? err.message : String(err));
      }
    },
  ],
  [
    'list_protocols',
    async () => {
      const protocols = listProtocols().map((pack) => ({
        id: pack.id,
        name: pack.name,
        aliases: pack.aliases,
        chains: Object.keys(pack.chains).map(Number),
        metrics: Object.keys(pack.metrics),
      }));
      return ok({ protocols });
    },
  ],
  [
    'list_metrics',
    async (input: Record<string, unknown>) => {
      try {
        const protocol = assertStr(input['protocol'], 'protocol');
        const pack = resolveProtocol(protocol);
        const metrics = Object.values(pack.metrics).map((m) => ({
          id: m.id,
          label: m.label,
          description: m.description,
          methodology: m.methodology,
          unit: m.unit,
          source: m.source,
        }));
        return ok({ protocol: pack.id, metrics });
      } catch (err) {
        if (err instanceof UnknownProtocolError) return toolErr(err.code, err.message, err.hint);
        return toolErr('METRICS_ERROR', err instanceof Error ? err.message : String(err));
      }
    },
  ],
  [
    'get_metric_series',
    async (input: Record<string, unknown>) => {
      const apiToken = getApiToken();
      if (!apiToken) return toolErr('CONFIG_ERROR', 'ENVIO_API_TOKEN is not set');
      try {
        const protocol = assertStr(input['protocol'], 'protocol');
        const metric = assertStr(input['metric'], 'metric');
        const chainId = assertInt(input['chainId'], 'chainId');
        const fromDate = assertDate(input['fromDate'], 'fromDate');
        const toDate = assertDate(input['toDate'], 'toDate');
        const series = await runMetric({ protocol, metric, chainId, dateRange: { from: fromDate, to: toDate }, apiToken });
        return ok(wrapToolResult('get_metric_series', series));
      } catch (err) {
        if (err instanceof UnknownProtocolError || err instanceof UnknownMetricError || err instanceof UnsupportedChainError) {
          return toolErr(err.code, err.message, err.hint);
        }
        return toolErr('UPSTREAM_ERROR', err instanceof Error ? err.message : String(err));
      }
    },
  ],
  [
    'compare_metric',
    async (input: Record<string, unknown>) => {
      const apiToken = getApiToken();
      if (!apiToken) return toolErr('CONFIG_ERROR', 'ENVIO_API_TOKEN is not set');
      try {
        const protocol = assertStr(input['protocol'], 'protocol');
        const metric = assertStr(input['metric'], 'metric');
        const chainId = assertInt(input['chainId'], 'chainId');
        const baselineFrom = assertDate(input['baselineFrom'], 'baselineFrom');
        const baselineTo = assertDate(input['baselineTo'], 'baselineTo');
        const currentFrom = assertDate(input['currentFrom'], 'currentFrom');
        const currentTo = assertDate(input['currentTo'], 'currentTo');

        const [baseline, current] = await Promise.all([
          runMetric({ protocol, metric, chainId, dateRange: { from: baselineFrom, to: baselineTo }, apiToken }),
          runMetric({ protocol, metric, chainId, dateRange: { from: currentFrom, to: currentTo }, apiToken }),
        ]);

        const sumPoints = (pts: { value: string }[]): bigint =>
          pts.reduce((acc, p) => acc + BigInt(p.value), 0n);
        const baselineTotal = sumPoints(baseline.points);
        const currentTotal = sumPoints(current.points);

        let pctChange: string | null = null;
        if (baselineTotal !== 0n) {
          const change = ((currentTotal - baselineTotal) * 10000n) / baselineTotal;
          pctChange = (Number(change) / 100).toFixed(2);
        }

        return ok(wrapToolResult('compare_metric', {
          protocol, metric, chainId, unit: baseline.unit,
          baseline: { from: baselineFrom, to: baselineTo, total: baselineTotal.toString() },
          current: { from: currentFrom, to: currentTo, total: currentTotal.toString() },
          pctChange, asOfBlock: current.asOfBlock,
        }));
      } catch (err) {
        if (err instanceof UnknownProtocolError || err instanceof UnknownMetricError || err instanceof UnsupportedChainError) {
          return toolErr(err.code, err.message, err.hint);
        }
        return toolErr('UPSTREAM_ERROR', err instanceof Error ? err.message : String(err));
      }
    },
  ],
  [
    'top_accounts',
    async (input: Record<string, unknown>) => {
      const apiToken = getApiToken();
      if (!apiToken) return toolErr('CONFIG_ERROR', 'ENVIO_API_TOKEN is not set');
      try {
        const rawAddresses = input['addresses'];
        if (!Array.isArray(rawAddresses)) throw new Error('addresses must be an array');
        const addresses: string[] = rawAddresses.map((a, i) => {
          if (typeof a !== 'string' || !HEX_ADDRESS.test(a)) throw new Error(`addresses[${i}] is not a valid hex address`);
          return a;
        });
        const chainId = assertInt(input['chainId'], 'chainId');
        const fromDate = assertDate(input['fromDate'], 'fromDate');
        const toDate = assertDate(input['toDate'], 'toDate');
        const limit = typeof input['limit'] === 'number' ? Math.min(100, Math.max(1, Math.trunc(input['limit']))) : 20;

        const client = createHypersyncClient(chainId, apiToken);
        const blockRange = await dateRangeToBlockRange(client, fromDate, toDate, chainId);
        const counts = new Map<string, number>();

        for await (const batch of streamLogs(client, {
          addresses,
          fromBlock: blockRange.from,
          toBlock: blockRange.to,
          fieldSelection: { log: ['Topic1'], block: ['Number'] },
        })) {
          for (const log of batch.logs) {
            const account = log.topics[1];
            if (!account) continue;
            const addr = ('0x' + account.slice(26)).toLowerCase();
            counts.set(addr, (counts.get(addr) ?? 0) + 1);
          }
        }

        const sorted = Array.from(counts.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, limit)
          .map(([address, eventCount]) => ({ address, eventCount }));

        return ok(wrapToolResult('top_accounts', { chainId, fromDate, toDate, accounts: sorted }));
      } catch (err) {
        return toolErr('UPSTREAM_ERROR', err instanceof Error ? err.message : String(err));
      }
    },
  ],
  [
    'contract_activity',
    async (input: Record<string, unknown>) => {
      const apiToken = getApiToken();
      if (!apiToken) return toolErr('CONFIG_ERROR', 'ENVIO_API_TOKEN is not set');
      try {
        const rawAddresses = input['addresses'];
        if (!Array.isArray(rawAddresses)) throw new Error('addresses must be an array');
        const addresses: string[] = rawAddresses.map((a, i) => {
          if (typeof a !== 'string' || !HEX_ADDRESS.test(a)) throw new Error(`addresses[${i}] is not a valid hex address`);
          return a;
        });
        const chainId = assertInt(input['chainId'], 'chainId');
        const fromDate = assertDate(input['fromDate'], 'fromDate');
        const toDate = assertDate(input['toDate'], 'toDate');

        const client = createHypersyncClient(chainId, apiToken);
        const blockRange = await dateRangeToBlockRange(client, fromDate, toDate, chainId);
        const dailyCounts = new Map<string, bigint>();
        const blockTimestamps = new Map<number, number>();

        for await (const batch of streamLogs(client, {
          addresses,
          fromBlock: blockRange.from,
          toBlock: blockRange.to,
          fieldSelection: { log: ['BlockNumber'], block: ['Number', 'Timestamp'] },
        })) {
          for (const [k, v] of batch.blockTimestamps) blockTimestamps.set(k, v);
          for (const log of batch.logs) {
            if (log.blockNumber === undefined) continue;
            const ts = blockTimestamps.get(log.blockNumber);
            if (ts === undefined) continue;
            const date = new Date(ts * 1000).toISOString().slice(0, 10);
            dailyCounts.set(date, (dailyCounts.get(date) ?? 0n) + 1n);
          }
        }

        const archiveHeight = await client.getHeight();
        const points = Array.from(dailyCounts.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, value: count.toString() }));

        return ok(wrapToolResult('contract_activity', { chainId, addresses, fromDate, toDate, points, asOfBlock: archiveHeight }));
      } catch (err) {
        return toolErr('UPSTREAM_ERROR', err instanceof Error ? err.message : String(err));
      }
    },
  ],
]);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'supported_chains',
    description: 'List all EVM chains supported by HyperSync with their chain IDs and names.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'resolve_protocol',
    description:
      'Resolve a free-text protocol name to its canonical id. ALWAYS call this first before listing or fetching metrics. Returns id, name, aliases, and supported chain IDs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Protocol name or alias, e.g. "uniswap v3", "aave", "sushi"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_protocols',
    description: 'List all registered protocols with their supported chains and available metric IDs.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_metrics',
    description: 'List all available metrics for a protocol with their descriptions, units, and methodology.',
    input_schema: {
      type: 'object',
      properties: {
        protocol: { type: 'string', description: 'Canonical protocol id from resolve_protocol' },
      },
      required: ['protocol'],
    },
  },
  {
    name: 'get_metric_series',
    description:
      'Fetch a daily time-series for a single metric. Returns one data point per day. Use this to validate data exists before creating a widget.',
    input_schema: {
      type: 'object',
      properties: {
        protocol: { type: 'string', description: 'Canonical protocol id' },
        metric: { type: 'string', description: 'Metric id from list_metrics' },
        chainId: { type: 'number', description: 'EVM chain id, e.g. 1 for Ethereum' },
        fromDate: { type: 'string', description: 'Start date inclusive, YYYY-MM-DD UTC' },
        toDate: { type: 'string', description: 'End date inclusive, YYYY-MM-DD UTC' },
      },
      required: ['protocol', 'metric', 'chainId', 'fromDate', 'toDate'],
    },
  },
  {
    name: 'compare_metric',
    description:
      'Compare a metric total between two date ranges. Returns totals for both periods and the percentage change.',
    input_schema: {
      type: 'object',
      properties: {
        protocol: { type: 'string' },
        metric: { type: 'string' },
        chainId: { type: 'number' },
        baselineFrom: { type: 'string', description: 'Baseline start, YYYY-MM-DD' },
        baselineTo: { type: 'string', description: 'Baseline end, YYYY-MM-DD' },
        currentFrom: { type: 'string', description: 'Current period start, YYYY-MM-DD' },
        currentTo: { type: 'string', description: 'Current period end, YYYY-MM-DD' },
      },
      required: ['protocol', 'metric', 'chainId', 'baselineFrom', 'baselineTo', 'currentFrom', 'currentTo'],
    },
  },
  {
    name: 'top_accounts',
    description:
      'Return the top accounts by event count that interacted with one or more contracts. Uses topic1 as the account identifier (indexed sender/from fields).',
    input_schema: {
      type: 'object',
      properties: {
        addresses: { type: 'array', items: { type: 'string' }, description: 'Contract address(es) to query' },
        chainId: { type: 'number' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
        limit: { type: 'number', description: 'Max accounts to return (default 20, max 100)' },
      },
      required: ['addresses', 'chainId', 'fromDate', 'toDate'],
    },
  },
  {
    name: 'contract_activity',
    description: 'Fetch daily event counts for one or more contract addresses.',
    input_schema: {
      type: 'object',
      properties: {
        addresses: { type: 'array', items: { type: 'string' }, description: 'Contract address(es) to query' },
        chainId: { type: 'number' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
      },
      required: ['addresses', 'chainId', 'fromDate', 'toDate'],
    },
  },
];
