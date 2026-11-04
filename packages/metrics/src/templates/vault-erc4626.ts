import { keccak256, toBytes, decodeAbiParameters } from 'viem';
import { streamLogs, mapToPoints } from '@envio-dashboard-ai/hypersync';
import type { ForkConfig } from '@envio-dashboard-ai/core';
import type { ProtocolPack, ComputeContext } from '../types.js';
import type { BlockRange, MetricSeriesPoint } from '@envio-dashboard-ai/core';

const DEPOSIT_TOPIC0 = keccak256(toBytes('Deposit(address,address,uint256,uint256)'));
const WITHDRAW_TOPIC0 = keccak256(
  toBytes('Withdraw(address,address,address,uint256,uint256)'),
);

type Direction = 'deposit' | 'withdraw';

async function computeFlowMetric(
  ctx: ComputeContext,
  range: BlockRange,
  vaults: string[],
  direction: Direction,
): Promise<MetricSeriesPoint[]> {
  if (!vaults.length) return [];

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

export function createVaultErc4626Pack(config: ForkConfig): ProtocolPack {
  const chains: ProtocolPack['chains'] = {};
  for (const [chainId, chainCfg] of Object.entries(config.chains)) {
    if (chainCfg.vaults?.length) {
      chains[chainId] = { startBlock: chainCfg.startBlock, contracts: chainCfg.vaults };
    }
  }

  return {
    id: config.id,
    name: config.name,
    aliases: config.aliases,
    chains,
    metrics: {
      deposits: {
        id: 'deposits',
        label: 'Deposits (assets)',
        description: 'Daily deposit volume in vault asset units',
        methodology:
          `Sum of the assets field from EIP-4626 Deposit events on ${config.name} vault(s). ` +
          'Assets are in the vault underlying token decimals.',
        source: 'hypersync',
        unit: 'token',
        compute: (ctx, range) => {
          const vaults = config.chains[String(ctx.chainId)]?.vaults ?? [];
          return computeFlowMetric(ctx, range, vaults, 'deposit');
        },
      },
      withdrawals: {
        id: 'withdrawals',
        label: 'Withdrawals (assets)',
        description: 'Daily withdrawal volume in vault asset units',
        methodology: `Sum of the assets field from EIP-4626 Withdraw events on ${config.name} vault(s).`,
        source: 'hypersync',
        unit: 'token',
        compute: (ctx, range) => {
          const vaults = config.chains[String(ctx.chainId)]?.vaults ?? [];
          return computeFlowMetric(ctx, range, vaults, 'withdraw');
        },
      },
      net_flow: {
        id: 'net_flow',
        label: 'Net Flow (assets)',
        description: 'Deposits minus withdrawals per day',
        methodology: `sum(Deposit.assets) - sum(Withdraw.assets) per UTC day on ${config.name} vault(s).`,
        source: 'hypersync',
        unit: 'token',
        compute: async (ctx, range) => {
          const vaults = config.chains[String(ctx.chainId)]?.vaults ?? [];
          const [deposits, withdrawals] = await Promise.all([
            computeFlowMetric(ctx, range, vaults, 'deposit'),
            computeFlowMetric(ctx, range, vaults, 'withdraw'),
          ]);
          const withdrawMap = new Map(withdrawals.map((p) => [p.date, BigInt(p.value)]));
          return deposits.map((p) => ({
            date: p.date,
            value: (BigInt(p.value) - (withdrawMap.get(p.date) ?? 0n)).toString(),
          }));
        },
      },
    },
  };
}
