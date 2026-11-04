import type { MetricUnit } from '@envio-dashboard-ai/core';

// Convert micro-USD string to display dollars (floating point for charts)
export function microUsdToDollars(microUsdStr: string): number {
  const val = BigInt(microUsdStr);
  // Multiply by 100 before dividing to preserve 2 decimal places
  return Number(val * 100n / 1_000_000n) / 100;
}

export function formatUsd(dollars: number): string {
  if (dollars >= 1_000_000_000) return `$${(dollars / 1_000_000_000).toFixed(2)}B`;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(2)}`;
}

export function formatCount(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatGas(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M gas`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K gas`;
  return `${value} gas`;
}

// Convert a BigInt decimal string to a chart-friendly number for a given unit
export function pointValueToNumber(valueStr: string, unit: MetricUnit): number {
  if (unit === 'usd') return microUsdToDollars(valueStr);
  // For count/gas/token: convert BigInt to number (safe for typical DeFi volumes)
  const big = BigInt(valueStr);
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
    // Scale down to avoid loss on very large counts
    return Number(big / 1_000n) * 1_000;
  }
  return Number(big);
}

export function formatChartValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'usd': return formatUsd(value);
    case 'count': return formatCount(value);
    case 'gas': return formatGas(value);
    case 'token': return formatCount(value);
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatBlockAge(asOfTimestamp: number): string {
  const ageMs = Date.now() - asOfTimestamp * 1000;
  const ageMin = Math.floor(ageMs / 60_000);
  if (ageMin < 1) return 'just now';
  if (ageMin < 60) return `${ageMin} min ago`;
  const ageHr = Math.floor(ageMin / 60);
  if (ageHr < 24) return `${ageHr}h ago`;
  return `${Math.floor(ageHr / 24)}d ago`;
}

export function formatBlockNumber(n: number): string {
  return n.toLocaleString();
}

// Sum an array of BigInt decimal strings
export function sumPoints(points: { value: string }[]): bigint {
  return points.reduce((acc, p) => acc + BigInt(p.value), 0n);
}
