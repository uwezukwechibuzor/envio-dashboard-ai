import { describe, it, expect } from 'vitest';
import { createDexV3Pack } from './dex-v3.js';

const SUSHI_V3_CONFIG = {
  id: 'sushiswap-v3',
  name: 'SushiSwap V3',
  aliases: ['sushiv3'],
  template: 'dex-v3' as const,
  chains: {
    '1': {
      startBlock: 17000000,
      factory: '0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4f',
    },
    '42161': {
      startBlock: 101000000,
      factory: '0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e',
    },
  },
};

describe('createDexV3Pack', () => {
  it('creates pack with correct id and metrics', () => {
    const pack = createDexV3Pack(SUSHI_V3_CONFIG);
    expect(pack.id).toBe('sushiswap-v3');
    expect(Object.keys(pack.metrics)).toEqual(
      expect.arrayContaining(['volume_usd', 'fees_usd', 'txs', 'unique_users']),
    );
  });

  it('builds chains record from factories', () => {
    const pack = createDexV3Pack(SUSHI_V3_CONFIG);
    expect(pack.chains['1']!.factories).toContain(
      '0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4f',
    );
    expect(pack.chains['42161']!.factories).toContain(
      '0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e',
    );
  });

  it('all metrics have non-empty methodology strings', () => {
    const pack = createDexV3Pack(SUSHI_V3_CONFIG);
    for (const [id, m] of Object.entries(pack.metrics)) {
      expect(m.methodology.length, `${id}.methodology is empty`).toBeGreaterThan(20);
    }
  });

  it('returns empty for chain with no factory', async () => {
    const pack = createDexV3Pack({
      ...SUSHI_V3_CONFIG,
      chains: { '1': { startBlock: 0 } },
    });
    expect(pack.chains['1']).toBeUndefined();
  });

  it('protocol name appears in metric labels', () => {
    const pack = createDexV3Pack(SUSHI_V3_CONFIG);
    const hasNameRef = Object.values(pack.metrics).some(
      (m) => m.methodology.includes('SushiSwap V3'),
    );
    expect(hasNameRef).toBe(true);
  });
});
