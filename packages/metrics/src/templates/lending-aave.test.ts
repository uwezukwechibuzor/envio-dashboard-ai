import { describe, it, expect } from 'vitest';
import { createLendingAavePack } from './lending-aave.js';

const SPARK_CONFIG = {
  id: 'spark',
  name: 'Spark',
  aliases: ['spark-protocol'],
  template: 'lending-aave' as const,
  chains: {
    '1': {
      startBlock: 16948801,
      pool: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987',
    },
  },
};

describe('createLendingAavePack', () => {
  it('creates pack with correct id', () => {
    const pack = createLendingAavePack(SPARK_CONFIG);
    expect(pack.id).toBe('spark');
  });

  it('exposes deposits_usd, borrows_usd, liquidations_count, txs metrics', () => {
    const pack = createLendingAavePack(SPARK_CONFIG);
    expect(Object.keys(pack.metrics)).toEqual(
      expect.arrayContaining(['deposits_usd', 'borrows_usd', 'liquidations_count', 'txs']),
    );
  });

  it('includes pool address in chains contracts', () => {
    const pack = createLendingAavePack(SPARK_CONFIG);
    expect(pack.chains['1']!.contracts).toContain(
      '0xC13e21B648A5Ee794902342038FF3aDAB66BE987',
    );
  });

  it('methodology references protocol name', () => {
    const pack = createLendingAavePack(SPARK_CONFIG);
    const depositMeth = pack.metrics['deposits_usd']!.methodology;
    expect(depositMeth).toContain('Spark');
  });

  it('excludes chain without pool from chains record', () => {
    const pack = createLendingAavePack({
      ...SPARK_CONFIG,
      chains: { '1': { startBlock: 0 } },
    });
    expect(pack.chains['1']).toBeUndefined();
  });
});
