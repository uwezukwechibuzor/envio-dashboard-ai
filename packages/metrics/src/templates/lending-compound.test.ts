import { describe, it, expect } from 'vitest';
import { createLendingCompoundPack } from './lending-compound.js';

const COMPOUND_V2_CONFIG = {
  id: 'compound-v2',
  name: 'Compound V2',
  aliases: ['compound'],
  template: 'lending-compound' as const,
  chains: {
    '1': {
      startBlock: 7710671,
      comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3b',
    },
  },
};

describe('createLendingCompoundPack', () => {
  it('creates pack with correct id', () => {
    const pack = createLendingCompoundPack(COMPOUND_V2_CONFIG);
    expect(pack.id).toBe('compound-v2');
  });

  it('exposes supply_txs, borrow_txs, txs metrics', () => {
    const pack = createLendingCompoundPack(COMPOUND_V2_CONFIG);
    expect(Object.keys(pack.metrics)).toEqual(
      expect.arrayContaining(['supply_txs', 'borrow_txs', 'txs']),
    );
  });

  it('all metrics use count unit', () => {
    const pack = createLendingCompoundPack(COMPOUND_V2_CONFIG);
    for (const m of Object.values(pack.metrics)) {
      expect(m.unit).toBe('count');
    }
  });

  it('methodology references Comptroller', () => {
    const pack = createLendingCompoundPack(COMPOUND_V2_CONFIG);
    expect(pack.metrics['supply_txs']!.methodology).toContain('Comptroller');
  });

  it('excludes chain without comptroller from chains record', () => {
    const pack = createLendingCompoundPack({
      ...COMPOUND_V2_CONFIG,
      chains: { '1': { startBlock: 0 } },
    });
    expect(pack.chains['1']).toBeUndefined();
  });
});
