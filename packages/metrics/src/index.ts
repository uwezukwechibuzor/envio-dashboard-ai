import { registerPack } from './registry.js';
import { uniswapV3Pack } from './packs/uniswap-v3/index.js';
import { uniswapV2Pack } from './packs/uniswap-v2/index.js';
import { uniswapV4Pack } from './packs/uniswap-v4/index.js';
import { aaveV3Pack } from './packs/aave-v3/index.js';
import { erc4626Pack } from './packs/erc4626/index.js';
import { erc20Pack } from './packs/erc20/index.js';
import { genericActivityPack } from './packs/generic-activity/index.js';

registerPack(uniswapV3Pack);
registerPack(uniswapV2Pack);
registerPack(uniswapV4Pack);
registerPack(aaveV3Pack);
registerPack(erc4626Pack);
registerPack(erc20Pack);
registerPack(genericActivityPack);

export { runMetric } from './engine.js';
export { resolveProtocol, listProtocols, getPack } from './registry.js';
export { swapUsdFromStable, isStablecoin, STABLECOINS } from './pricing.js';
export type { ProtocolPack, PackMetricEntry, ComputeContext } from './types.js';
