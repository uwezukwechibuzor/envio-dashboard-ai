import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, mapToPoints } from "@envio-dashboard-ai/hypersync";
import type { ProtocolPack, ComputeContext } from '../../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

// EIP-4626 events
const DEPOSIT_TOPIC0 = keccak256(toBytes('Deposit(address,address,uint256,uint256)'));
const WITHDRAW_TOPIC0 = keccak256(
  toBytes('Withdraw(address,address,address,uint256,uint256)'),
);

// Hastra vault — test target specified in the task
const HASTRA_VAULT = '0x19ebb35279A16207Ec4ba82799CC64715065F7F6';

type Direction = 'deposit' | 'withdraw';

async function computeFlowMetric(
  ctx: ComputeContext,
  range: BlockRange,
  direction: Direction,
  vaults: string[],
): Promise<MetricSeriesPoint[]> {
  const topic0 = direction === 'deposit' ? DEPOSIT_TOPIC0 : WITHDRAW_TOPIC0;
  const valueBuckets = new Map<string, bigint>();
  const allTimestamps = new Map<number, number>();

  for await (const batch of streamLogs(ctx.client, {
    addresses: vaults,
    topics: [[topic0]],
    fromBlock: range.from,
    toBlock: range.to,
  })) {
    for (const [k, v] of batch.blockTimestamps) allTimestamps.set(k, v);

    for (const log of batch.logs) {
      if (!log.data || log.blockNumber === undefined) continue;

      try {
        // Deposit(address sender, address owner, uint256 assets, uint256 shares)
        // Withdraw(address sender, address receiver, address owner, uint256 assets, uint256 shares)
        // assets is always first non-indexed field in data for both events
        const [assets] = decodeAbiParameters(
          [{ type: 'uint256' }, { type: 'uint256' }],
          log.data as `0x${string}`,
        );

        const ts = allTimestamps.get(log.blockNumber);
        if (ts === undefined) continue;
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        valueBuckets.set(date, (valueBuckets.get(date) ?? 0n) + (assets as bigint));
      } catch {
        // malformed — skip
      }
    }
  }

  return mapToPoints(valueBuckets);
}

async function computeNetFlow(
  ctx: ComputeContext,
  range: BlockRange,
  vaults: string[],
): Promise<MetricSeriesPoint[]> {
  const [deposits, withdrawals] = await Promise.all([
    computeFlowMetric(ctx, range, 'deposit', vaults),
    computeFlowMetric(ctx, range, 'withdraw', vaults),
  ]);

  const withdrawMap = new Map(withdrawals.map((p) => [p.date, BigInt(p.value)]));
  return deposits.map((p) => ({
    date: p.date,
    value: (BigInt(p.value) - (withdrawMap.get(p.date) ?? 0n)).toString(),
  }));
}

function makeERC4626Pack(
  id: string,
  name: string,
  aliases: string[],
  chainContracts: Record<string, { startBlock: number; contracts: string[] }>,
): ProtocolPack {
  return {
    id,
    name,
    aliases,
    chains: chainContracts,
    metrics: {
      deposits: {
        id: 'deposits',
        label: 'Deposits (assets)',
        description: 'Daily deposit volume in vault asset units',
        methodology:
          'Sum of the `assets` field from EIP-4626 Deposit events. ' +
          'Assets are in the vault underlying token decimals.',
        source: 'hypersync',
        unit: 'token',
        compute: (ctx, range) =>
          computeFlowMetric(ctx, range, 'deposit', Object.values(chainContracts).flatMap((c) => c.contracts)),
      },
      withdrawals: {
        id: 'withdrawals',
        label: 'Withdrawals (assets)',
        description: 'Daily withdrawal volume in vault asset units',
        methodology: 'Sum of the `assets` field from EIP-4626 Withdraw events.',
        source: 'hypersync',
        unit: 'token',
        compute: (ctx, range) =>
          computeFlowMetric(ctx, range, 'withdraw', Object.values(chainContracts).flatMap((c) => c.contracts)),
      },
      net_flow: {
        id: 'net_flow',
        label: 'Net Flow (assets)',
        description: 'Deposits minus withdrawals per day',
        methodology: 'sum(Deposit.assets) - sum(Withdraw.assets) per UTC day.',
        source: 'hypersync',
        unit: 'token',
        compute: (ctx, range) =>
          computeNetFlow(ctx, range, Object.values(chainContracts).flatMap((c) => c.contracts)),
      },
    },
  };
}

export const erc4626Pack = makeERC4626Pack(
  'erc4626',
  'ERC-4626 Vault',
  ['erc4626', 'eip4626', 'vault'],
  {
    '1': { startBlock: 15000000, contracts: [HASTRA_VAULT] },
  },
);
