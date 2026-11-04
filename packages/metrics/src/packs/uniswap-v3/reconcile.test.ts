/**
 * Reconciliation test: compares Uniswap V3 daily volume on Ethereum against
 * DefiLlama's public API. Network-dependent — skipped unless ENVIO_API_TOKEN is set.
 *
 * Tolerance: ±40%
 * Known divergences:
 *  - Only stablecoin-paired pools are counted (USDC, USDT, DAI sides).
 *    WETH/WBTC and other non-stable pairs are excluded, reducing our count vs.
 *    DefiLlama's full-price approach by roughly 15–30%.
 *  - DefiLlama uses token prices at swap time; we use the stablecoin amount directly.
 *  - Block boundary approximation (avgBlockTime-based) may misalign by ±1 hour.
 */
import { describe, it, expect } from 'vitest';
import { EnvConfigSchema } from '@envio-dashboard-ai/core';
import '../../index.js';
import { runMetric } from '../../engine.js';

const TOLERANCE = 0.4; // ±40%
const DAYS = 7;
const CHAIN_ID = 1; // Ethereum

describe.skipIf(!process.env['ENVIO_API_TOKEN'])(
  'uniswap-v3 reconciliation (network)',
  () => {
    it(
      `daily volume within ±${TOLERANCE * 100}% of DefiLlama over ${DAYS} days on Ethereum`,
      async () => {
        const env = EnvConfigSchema.parse(process.env);

        const toDate = new Date().toISOString().slice(0, 10);
        const fromDate = new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10);

        // Our numbers
        const series = await runMetric({
          protocol: 'uniswap-v3',
          metric: 'volume_usd',
          chainId: CHAIN_ID,
          dateRange: { from: fromDate, to: toDate },
          apiToken: env.ENVIO_API_TOKEN,
        });

        const ourTotal = series.points.reduce((sum, p) => sum + BigInt(p.value), 0n);

        // DefiLlama daily volume (last 7 days)
        const llamaRes = await fetch(
          'https://api.llama.fi/summary/dexs/uniswap%20v3?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume',
        );
        if (!llamaRes.ok) {
          console.warn('DefiLlama API unavailable — skipping comparison');
          return;
        }

        type LlamaResponse = {
          totalDataChart: [number, number][];
        };
        const data: LlamaResponse = await llamaRes.json() as LlamaResponse;
        const recentPoints = data.totalDataChart.slice(-DAYS);
        const llamaTotal = recentPoints.reduce((sum, [, v]) => sum + v, 0);

        const ourFloat = Number(ourTotal);
        const ratio = ourFloat / llamaTotal;

        console.info(`Our total (USD):    ${ourFloat.toLocaleString()}`);
        console.info(`DefiLlama total:    ${llamaTotal.toLocaleString()}`);
        console.info(`Ratio:              ${ratio.toFixed(3)}`);
        console.info(`Tolerance:          ±${TOLERANCE * 100}%`);
        console.info(`Known gap: stablecoin-only pools, ~15–30% undercount vs full-price approach`);

        expect(ratio).toBeGreaterThan(1 - TOLERANCE);
        expect(ratio).toBeLessThan(1 + TOLERANCE);
      },
      { timeout: 300_000 },
    );
  },
);
