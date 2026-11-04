import { describe, it, expect } from 'vitest';
import { createVaultErc4626Pack } from './vault-erc4626.js';

const VAULT_CONFIG = {
  id: 'my-vault',
  name: 'My Vault',
  aliases: ['myvault'],
  template: 'vault-erc4626' as const,
  chains: {
    '1': {
      startBlock: 15000000,
      vaults: ['0x19ebb35279A16207Ec4ba82799CC64715065F7F6'],
    },
  },
};

describe('createVaultErc4626Pack', () => {
  it('creates pack with correct id', () => {
    const pack = createVaultErc4626Pack(VAULT_CONFIG);
    expect(pack.id).toBe('my-vault');
  });

  it('exposes deposits, withdrawals, net_flow metrics', () => {
    const pack = createVaultErc4626Pack(VAULT_CONFIG);
    expect(Object.keys(pack.metrics)).toEqual(
      expect.arrayContaining(['deposits', 'withdrawals', 'net_flow']),
    );
  });

  it('all metrics use token unit', () => {
    const pack = createVaultErc4626Pack(VAULT_CONFIG);
    for (const m of Object.values(pack.metrics)) {
      expect(m.unit).toBe('token');
    }
  });

  it('includes vault addresses in chains contracts', () => {
    const pack = createVaultErc4626Pack(VAULT_CONFIG);
    expect(pack.chains['1']!.contracts).toContain(
      '0x19ebb35279A16207Ec4ba82799CC64715065F7F6',
    );
  });

  it('excludes chain without vaults from chains record', () => {
    const pack = createVaultErc4626Pack({
      ...VAULT_CONFIG,
      chains: { '1': { startBlock: 0 } },
    });
    expect(pack.chains['1']).toBeUndefined();
  });

  it('methodology references protocol name', () => {
    const pack = createVaultErc4626Pack(VAULT_CONFIG);
    expect(pack.metrics['deposits']!.methodology).toContain('My Vault');
  });
});
