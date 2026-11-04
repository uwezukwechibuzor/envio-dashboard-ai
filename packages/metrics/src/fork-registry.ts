import { ForkConfigSchema, type ForkConfig } from '@envio-dashboard-ai/core';
import { createDexV2Pack } from './templates/dex-v2.js';
import { createDexV3Pack } from './templates/dex-v3.js';
import { createLendingAavePack } from './templates/lending-aave.js';
import { createLendingCompoundPack } from './templates/lending-compound.js';
import { createVaultErc4626Pack } from './templates/vault-erc4626.js';
import { registerPack } from './registry.js';
import type { ProtocolPack } from './types.js';

import sushiswapV2Json from './forks/sushiswap-v2.json' with { type: 'json' };
import pancakeswapV2Json from './forks/pancakeswap-v2.json' with { type: 'json' };
import quickswapV2Json from './forks/quickswap-v2.json' with { type: 'json' };
import sushiswapV3Json from './forks/sushiswap-v3.json' with { type: 'json' };
import pancakeswapV3Json from './forks/pancakeswap-v3.json' with { type: 'json' };
import sparkJson from './forks/spark.json' with { type: 'json' };
import compoundV2Json from './forks/compound-v2.json' with { type: 'json' };
import venusJson from './forks/venus.json' with { type: 'json' };

function parseFork(raw: unknown): ForkConfig {
  return ForkConfigSchema.parse(raw);
}

export const FORK_CONFIGS: ForkConfig[] = [
  parseFork(sushiswapV2Json),
  parseFork(pancakeswapV2Json),
  parseFork(quickswapV2Json),
  parseFork(sushiswapV3Json),
  parseFork(pancakeswapV3Json),
  parseFork(sparkJson),
  parseFork(compoundV2Json),
  parseFork(venusJson),
];

export function createPackFromFork(config: ForkConfig): ProtocolPack {
  switch (config.template) {
    case 'dex-v2':
      return createDexV2Pack(config);
    case 'dex-v3':
      return createDexV3Pack(config);
    case 'lending-aave':
      return createLendingAavePack(config);
    case 'lending-compound':
      return createLendingCompoundPack(config);
    case 'vault-erc4626':
      return createVaultErc4626Pack(config);
  }
}

export function registerForks(): void {
  for (const config of FORK_CONFIGS) {
    registerPack(createPackFromFork(config));
  }
}
