import { describe, it, expect, vi } from 'vitest';
import type { HypersyncClient } from '@envio-dev/hypersync-client';
import { createDexV2Pack } from './dex-v2.js';
import type { ComputeContext } from '../types.js';
import { swapUsdFromStable } from '../pricing.js';

const SUSHI_V2_CONFIG = {
  id: 'sushiswap-v2',
  name: 'SushiSwap V2',
  aliases: ['sushi'],
  template: 'dex-v2' as const,
  chains: {
    '1': { startBlock: 10794229, factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac' },
  },
  feeBps: 30,
};

function makeMockClient(pages: object[]): HypersyncClient {
  let call = 0;
  return {
    get: vi.fn().mockImplementation(() => {
      const page = pages[call] ?? {
        ...pages[pages.length - 1],
        data: { blocks: [], logs: [], transactions: [], traces: [] },
        nextBlock: 99999999,
      };
      call++;
      return Promise.resolve(page);
    }),
    getHeight: vi.fn().mockResolvedValue(20000100),
    getChainId: vi.fn().mockResolvedValue(1),
  } as unknown as HypersyncClient;
}

describe('createDexV2Pack', () => {
  it('creates pack with correct id and aliases', () => {
    const pack = createDexV2Pack(SUSHI_V2_CONFIG);
    expect(pack.id).toBe('sushiswap-v2');
    expect(pack.aliases).toContain('sushi');
  });

  it('exposes volume_usd, fees_usd, txs metrics', () => {
    const pack = createDexV2Pack(SUSHI_V2_CONFIG);
    expect(Object.keys(pack.metrics)).toEqual(
      expect.arrayContaining(['volume_usd', 'fees_usd', 'txs']),
    );
  });

  it('builds chains record from config factories', () => {
    const pack = createDexV2Pack(SUSHI_V2_CONFIG);
    expect(pack.chains['1']).toBeDefined();
    expect(pack.chains['1']!.factories).toContain(
      '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
    );
  });

  it('applies feeBps override in methodology', () => {
    const pack = createDexV2Pack({ ...SUSHI_V2_CONFIG, feeBps: 25 });
    expect(pack.metrics['fees_usd']!.methodology).toContain('25');
  });

  it('returns empty array for chain with no factory', () => {
    const pack = createDexV2Pack({
      ...SUSHI_V2_CONFIG,
      chains: { '1': { startBlock: 0 } }, // no factory
    });
    expect(pack.chains['1']).toBeUndefined();
  });

  it('computes txs from fixture without network', async () => {
    const PAIR_PAGE = {
      archiveHeight: 20000100,
      nextBlock: 20000100,
      data: {
        blocks: [{ number: 19000000, timestamp: 1699000000 }],
        logs: [
          {
            blockNumber: 19000000,
            address: '0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac',
            topics: [
              '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9',
              '0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
              '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            ],
            // abi.encode(address pair, uint256 allPairs) — pair at first 32 bytes
            data: '0x00000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f56400000000000000000000000000000000000000000000000000000000000000001',
            transactionHash: '0xpair1',
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
      data: {
        blocks: [{ number: 20000000, timestamp: 1700000000 }],
        logs: [
          {
            blockNumber: 20000000,
            address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
            topics: [
              '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
              '0x000000000000000000000000e592427a0aece92de3edee1f18e0157c05861564',
              '0x000000000000000000000000e592427a0aece92de3edee1f18e0157c05861564',
            ],
            // amount0In=0, amount1In=0.5 ETH, amount0Out=1000 USDC, amount1Out=0
            data: '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006a94d74f43000000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000000',
            transactionHash: '0xswap1',
          },
        ],
        transactions: [],
        traces: [],
      },
      rollbackGuard: null,
    };

    const client = makeMockClient([PAIR_PAGE, SWAP_PAGE]);
    const ctx: ComputeContext = {
      chainId: 1,
      client,
      swapUsdFromStable: (t0, t1, a0, a1) => swapUsdFromStable(1, t0, t1, a0, a1),
    };

    const pack = createDexV2Pack(SUSHI_V2_CONFIG);
    const range = { from: 19000000, to: 20000100 };
    const points = await pack.metrics['txs']!.compute(ctx, range);
    expect(points.length).toBeGreaterThan(0);
    const day = points.find((p) => p.date === '2023-11-14');
    expect(day).toBeDefined();
    expect(BigInt(day!.value)).toBeGreaterThan(0n);
  });
});
