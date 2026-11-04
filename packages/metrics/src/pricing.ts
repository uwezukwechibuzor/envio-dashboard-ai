/**
 * USD pricing module.
 *
 * Strategy:
 *  - Known stablecoins → $1 exactly.
 *  - All amounts stay BigInt; USD value is returned as a bigint in
 *    "micro-USD" units (1 USD = 1_000_000) to preserve precision.
 *  - If neither token is a stablecoin, returns null (caller skips the swap).
 */

export type TokenInfo = {
  address: string; // lowercase
  symbol: string;
  decimals: number;
  isStable: boolean;
};

// Stablecoins per chain (lowercase addresses)
export const STABLECOINS: Record<number, TokenInfo[]> = {
  1: [
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', decimals: 6, isStable: true },
    { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', decimals: 6, isStable: true },
    { address: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI', decimals: 18, isStable: true },
    { address: '0x853d955acef822db058eb8505911ed77f175b99e', symbol: 'FRAX', decimals: 18, isStable: true },
  ],
  42161: [
    { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6, isStable: true },
    { address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', symbol: 'USDC.e', decimals: 6, isStable: true },
    { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', decimals: 6, isStable: true },
    { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', symbol: 'DAI', decimals: 18, isStable: true },
  ],
  8453: [
    { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6, isStable: true },
    { address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', symbol: 'DAI', decimals: 18, isStable: true },
  ],
  10: [
    { address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', symbol: 'USDC', decimals: 6, isStable: true },
    { address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', symbol: 'USDT', decimals: 6, isStable: true },
    { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', symbol: 'DAI', decimals: 18, isStable: true },
  ],
};

function buildStableSet(chainId: number): Map<string, TokenInfo> {
  const map = new Map<string, TokenInfo>();
  for (const t of STABLECOINS[chainId] ?? []) {
    map.set(t.address.toLowerCase(), t);
  }
  return map;
}

const stableSets = new Map<number, Map<string, TokenInfo>>();

function getStableSet(chainId: number): Map<string, TokenInfo> {
  if (!stableSets.has(chainId)) stableSets.set(chainId, buildStableSet(chainId));
  return stableSets.get(chainId)!;
}

export type UsdResult = {
  usdMicro: bigint; // USD × 1_000_000
  usedToken: 'token0' | 'token1';
};

/**
 * Given a Uniswap-style swap with signed token amounts, return the USD
 * volume using the stablecoin side. Returns null if neither token is a
 * known stablecoin on this chain.
 *
 * amount0 and amount1 are signed int256 values (negative = out of pool).
 */
export function swapUsdFromStable(
  chainId: number,
  token0: string,
  token1: string,
  amount0: bigint,
  amount1: bigint,
): UsdResult | null {
  const stables = getStableSet(chainId);
  const info0 = stables.get(token0.toLowerCase());
  const info1 = stables.get(token1.toLowerCase());

  if (info0) {
    const absAmount = amount0 < 0n ? -amount0 : amount0;
    // Convert to micro-USD: amount in raw units → USD × 1e6
    // absAmount is in info0.decimals units; micro-USD = absAmount × 1e6 / 10^decimals
    const usdMicro = (absAmount * 1_000_000n) / 10n ** BigInt(info0.decimals);
    return { usdMicro, usedToken: 'token0' };
  }

  if (info1) {
    const absAmount = amount1 < 0n ? -amount1 : amount1;
    const usdMicro = (absAmount * 1_000_000n) / 10n ** BigInt(info1.decimals);
    return { usdMicro, usedToken: 'token1' };
  }

  return null;
}

/** Convert micro-USD bigint to a whole-USD bigint (truncates cents). */
export function microUsdToUsd(microUsd: bigint): bigint {
  return microUsd / 1_000_000n;
}

export function isStablecoin(chainId: number, address: string): boolean {
  return getStableSet(chainId).has(address.toLowerCase());
}
