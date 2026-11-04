import { describe, it, expect, vi } from 'vitest';
import type { HypersyncClient } from '@envio-dev/hypersync-client';
import { uniswapV3Pack } from './index.js';
import type { ComputeContext } from '../../types.js';
import { swapUsdFromStable } from '../../pricing.js';

// Minimal recorded fixture — no network calls
const POOL_CREATED_PAGE = {
  archiveHeight: 20000100,
  nextBlock: 20000100,
  totalExecutionTime: 1,
  data: {
    blocks: [{ number: 19000000, timestamp: 1699000000 }],
    logs: [
      {
        blockNumber: 19000000,
        address: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
        // PoolCreated: topics = [topic0, token0(USDC), token1(WETH), fee(500)]
        topics: [
          '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
          '0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
          '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
          '0x00000000000000000000000000000000000000000000000000000000000001f4', // fee = 500
        ],
        // data = abi.encode(int24 tickSpacing=10, address pool)
        data:
          '0x000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
        transactionHash: '0xpool1',
      },
    ],
    transactions: [],
    traces: [],
  },
  rollbackGuard: null,
};

const SWAP_PAGE = {
  archiveHeight: 20000100,
  nextBlock: 20000100,
  totalExecutionTime: 1,
  data: {
    blocks: [{ number: 20000000, timestamp: 1700000000 }],
    logs: [
      {
        blockNumber: 20000000,
        address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
        topics: [
          '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
          '0x000000000000000000000000e592427a0aece92de3edee1f18e0157c05861564',
          '0x000000000000000000000000e592427a0aece92de3edee1f18e0157c05861564',
        ],
        // amount0 = -1000000 (1 USDC out of pool), amount1 = 500000000000000 (0.0005 WETH in)
        // rest of fields padded
        data:
          '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0bdc000000000000000000000000000000000000000000000000000071afd498d000000000000000000000000000000083c86a3e76ee5c6c8d6eae9a5f4db0000000000000000000000000000000000000000000019a4c7b79476c7c08b3fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffef',
        transactionHash: '0xswap1',
      },
    ],
    transactions: [],
    traces: [],
  },
  rollbackGuard: null,
};

function makeMockClient(pages: object[]): HypersyncClient {
  let call = 0;
  return {
    get: vi.fn().mockImplementation(() => {
      const page = pages[call] ?? { ...pages[pages.length - 1], data: { blocks: [], logs: [], transactions: [], traces: [] }, nextBlock: 99999999 };
      call++;
      return Promise.resolve(page);
    }),
    getHeight: vi.fn().mockResolvedValue(20000100),
    getChainId: vi.fn().mockResolvedValue(1),
  } as unknown as HypersyncClient;
}

describe('uniswapV3Pack', () => {
  it('has the correct id and aliases', () => {
    expect(uniswapV3Pack.id).toBe('uniswap-v3');
    expect(uniswapV3Pack.aliases).toContain('univ3');
  });

  it('supports ethereum, arbitrum, base', () => {
    expect(uniswapV3Pack.chains['1']).toBeDefined();
    expect(uniswapV3Pack.chains['42161']).toBeDefined();
    expect(uniswapV3Pack.chains['8453']).toBeDefined();
  });

  it('defines volume_usd, fees_usd, txs, unique_users metrics', () => {
    expect(Object.keys(uniswapV3Pack.metrics)).toEqual(
      expect.arrayContaining(['volume_usd', 'fees_usd', 'txs', 'unique_users']),
    );
  });

  it('all metrics have a non-empty methodology string', () => {
    for (const [id, m] of Object.entries(uniswapV3Pack.metrics)) {
      expect(m.methodology.length, `${id}.methodology is empty`).toBeGreaterThan(20);
    }
  });

  it('computes txs from fixture without network', async () => {
    const client = makeMockClient([
      POOL_CREATED_PAGE,
      SWAP_PAGE,
    ]);

    const ctx: ComputeContext = {
      chainId: 1,
      client,
      swapUsdFromStable: (t0, t1, a0, a1) => swapUsdFromStable(1, t0, t1, a0, a1),
    };

    const range = { from: 19000000, to: 20000100 };
    const points = await uniswapV3Pack.metrics['txs']!.compute(ctx, range);
    expect(points.length).toBeGreaterThan(0);
    // The fixture has 1 swap event on block 20000000 → timestamp 1700000000 → '2023-11-14'
    const day = points.find((p) => p.date === '2023-11-14');
    expect(day).toBeDefined();
    expect(BigInt(day!.value)).toBeGreaterThan(0n);
  });
});

describe('swapUsdFromStable', () => {
  it('returns USD value when token0 is USDC', () => {
    const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    // 1000 USDC = 1_000_000 raw units
    const result = swapUsdFromStable(1, USDC, WETH, -1_000_000n, 500_000_000_000_000n);
    expect(result).not.toBeNull();
    // 1_000_000 raw USDC × 1_000_000 / 10^6 = 1_000_000 micro-USD = 1 USD
    expect(result!.usdMicro).toBe(1_000_000n);
    // actually: 1_000_000 raw × 1_000_000 / 1_000_000 = 1_000_000 micro-USD → 1 USD
  });

  it('returns null for two non-stablecoins', () => {
    const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    const WBTC = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
    expect(swapUsdFromStable(1, WETH, WBTC, 1n, 1n)).toBeNull();
  });
});
