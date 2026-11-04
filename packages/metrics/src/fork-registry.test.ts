import { describe, it, expect } from 'vitest';
import { FORK_CONFIGS, createPackFromFork } from './fork-registry.js';
import { ForkConfigSchema } from '@envio-dashboard-ai/core';

describe('FORK_CONFIGS', () => {
  it('loads all 8 fork configs without throwing', () => {
    expect(FORK_CONFIGS).toHaveLength(8);
  });

  it('every fork config parses against ForkConfigSchema', () => {
    for (const cfg of FORK_CONFIGS) {
      expect(() => ForkConfigSchema.parse(cfg)).not.toThrow();
    }
  });

  it('every fork has unique id', () => {
    const ids = FORK_CONFIGS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all fork ids are kebab-case', () => {
    for (const cfg of FORK_CONFIGS) {
      expect(cfg.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('all chains have valid startBlock', () => {
    for (const cfg of FORK_CONFIGS) {
      for (const [chainId, chainCfg] of Object.entries(cfg.chains)) {
        expect(
          chainCfg.startBlock,
          `${cfg.id} chain ${chainId} startBlock`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('createPackFromFork', () => {
  it('creates a pack for every fork config', () => {
    for (const cfg of FORK_CONFIGS) {
      const pack = createPackFromFork(cfg);
      expect(pack.id).toBe(cfg.id);
      expect(pack.name).toBe(cfg.name);
      expect(Object.keys(pack.metrics).length).toBeGreaterThan(0);
    }
  });

  it('dex-v2 forks have volume_usd metric', () => {
    const dexV2Forks = FORK_CONFIGS.filter((c) => c.template === 'dex-v2');
    for (const cfg of dexV2Forks) {
      const pack = createPackFromFork(cfg);
      expect(pack.metrics['volume_usd'], `${cfg.id} missing volume_usd`).toBeDefined();
    }
  });

  it('dex-v3 forks have unique_users metric', () => {
    const dexV3Forks = FORK_CONFIGS.filter((c) => c.template === 'dex-v3');
    for (const cfg of dexV3Forks) {
      const pack = createPackFromFork(cfg);
      expect(pack.metrics['unique_users'], `${cfg.id} missing unique_users`).toBeDefined();
    }
  });

  it('lending-compound forks have supply_txs metric', () => {
    const compForks = FORK_CONFIGS.filter((c) => c.template === 'lending-compound');
    for (const cfg of compForks) {
      const pack = createPackFromFork(cfg);
      expect(pack.metrics['supply_txs'], `${cfg.id} missing supply_txs`).toBeDefined();
    }
  });
});
