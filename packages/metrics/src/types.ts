import type { HypersyncClient } from '@envio-dev/hypersync-client';
import type { BlockRange, MetricSeriesPoint, MetricUnit, DataSource } from '@envio-dashboard-ai/core';
import type { UsdResult } from './pricing.js';

export type ComputeContext = {
  chainId: number;
  client: HypersyncClient;
  swapUsdFromStable: (
    token0: string,
    token1: string,
    amount0: bigint,
    amount1: bigint,
  ) => UsdResult | null;
};

export type PackMetricEntry = {
  id: string;
  label: string;
  description: string;
  methodology: string;
  source: DataSource;
  unit: MetricUnit;
  compute(ctx: ComputeContext, range: BlockRange): Promise<MetricSeriesPoint[]>;
};

export type ChainEntry = {
  startBlock: number;
  contracts?: string[];
  factories?: string[];
};

export type ProtocolPack = {
  id: string;
  name: string;
  aliases: string[];
  chains: Record<string, ChainEntry>; // key = chainId as string
  metrics: Record<string, PackMetricEntry>;
};
