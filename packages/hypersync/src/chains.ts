export type ChainInfo = {
  id: number;
  name: string;
  url: string;
  avgBlockTimeMs: number; // milliseconds per block
};

export const CHAINS: Record<number, ChainInfo> = {
  1: {
    id: 1,
    name: 'ethereum',
    url: 'https://eth.hypersync.xyz',
    avgBlockTimeMs: 12_000,
  },
  42161: {
    id: 42161,
    name: 'arbitrum',
    url: 'https://arbitrum.hypersync.xyz',
    avgBlockTimeMs: 250,
  },
  8453: {
    id: 8453,
    name: 'base',
    url: 'https://base.hypersync.xyz',
    avgBlockTimeMs: 2_000,
  },
  10: {
    id: 10,
    name: 'optimism',
    url: 'https://optimism.hypersync.xyz',
    avgBlockTimeMs: 2_000,
  },
  137: {
    id: 137,
    name: 'polygon',
    url: 'https://polygon.hypersync.xyz',
    avgBlockTimeMs: 2_000,
  },
  56: {
    id: 56,
    name: 'bsc',
    url: 'https://bsc.hypersync.xyz',
    avgBlockTimeMs: 3_000,
  },
  43114: {
    id: 43114,
    name: 'avalanche',
    url: 'https://avalanche.hypersync.xyz',
    avgBlockTimeMs: 2_000,
  },
};

export function getChainInfo(chainId: number): ChainInfo {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Chain ${chainId} is not configured in hypersync wrapper`);
  return chain;
}
