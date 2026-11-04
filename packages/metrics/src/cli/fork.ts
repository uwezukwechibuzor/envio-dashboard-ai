#!/usr/bin/env tsx
/**
 * Fork management CLI.
 *
 * Usage:
 *   pnpm fork verify <id>              — fetch sample logs to confirm events appear
 *   pnpm fork detect <address> --chain <chainId>  — identify template from topic0s
 */
import { FORK_CONFIGS } from '../fork-registry.js';
import { createHypersyncClient, streamLogs, CHAINS } from '@envio-dashboard-ai/hypersync';
import { EnvConfigSchema } from '@envio-dashboard-ai/core';
import { keccak256, toBytes } from 'viem';

const KNOWN_TOPIC0S: Record<string, string> = {
  [keccak256(toBytes('PairCreated(address,address,address,uint256)'))]: 'dex-v2 PairCreated',
  [keccak256(toBytes('Swap(address,uint256,uint256,uint256,uint256,address)'))]: 'dex-v2 Swap',
  [keccak256(toBytes('PoolCreated(address,address,uint24,int24,address)'))]: 'dex-v3 PoolCreated',
  [keccak256(toBytes('Swap(address,address,int256,int256,uint160,uint128,int24)'))]: 'dex-v3 Swap',
  [keccak256(toBytes('Supply(address,address,address,uint256,uint16)'))]: 'lending-aave Supply',
  [keccak256(toBytes('Borrow(address,address,address,uint256,uint8,uint256,uint16)'))]:
    'lending-aave Borrow',
  [keccak256(toBytes('MarketListed(address)'))]: 'lending-compound MarketListed',
  [keccak256(toBytes('Mint(address,uint256,uint256)'))]: 'lending-compound Mint',
  [keccak256(toBytes('Borrow(address,uint256,uint256,uint256)'))]: 'lending-compound Borrow',
  [keccak256(toBytes('Deposit(address,address,uint256,uint256)'))]: 'vault-erc4626 Deposit',
  [keccak256(toBytes('Withdraw(address,address,address,uint256,uint256)'))]:
    'vault-erc4626 Withdraw',
};

async function cmdVerify(id: string): Promise<void> {
  const config = FORK_CONFIGS.find((c) => c.id === id);
  if (!config) {
    const ids = FORK_CONFIGS.map((c) => c.id).join(', ');
    console.error(`Unknown fork id: ${id}\nAvailable: ${ids}`);
    process.exit(1);
  }

  const env = EnvConfigSchema.parse(process.env);
  console.info(`Verifying fork: ${config.name} (template: ${config.template})\n`);

  for (const [chainIdStr, chainCfg] of Object.entries(config.chains)) {
    const chainId = Number(chainIdStr);
    if (!CHAINS[chainId]) {
      console.warn(`  Chain ${chainId}: not in HyperSync chain list, skipping`);
      continue;
    }

    const address =
      chainCfg.factory ??
      chainCfg.pool ??
      chainCfg.comptroller ??
      chainCfg.vaults?.[0];

    if (!address) {
      console.warn(`  Chain ${chainId}: no address configured, skipping`);
      continue;
    }

    const client = createHypersyncClient(chainId, env.ENVIO_API_TOKEN);
    const height = await client.getHeight();
    const toBlock = height;
    const fromBlock = Math.max(chainCfg.startBlock, toBlock - 50_000);

    console.info(`  Chain ${chainId} (${CHAINS[chainId]?.name}): scanning blocks ${fromBlock}–${toBlock}`);

    let found = false;
    for await (const batch of streamLogs(client, {
      addresses: [address],
      fromBlock,
      toBlock,
      fieldSelection: { log: ['Topic0'], block: ['Number'] },
    })) {
      for (const log of batch.logs) {
        const t0 = log.topics[0];
        if (t0) {
          const name = KNOWN_TOPIC0S[t0];
          console.info(`    Found event: ${name ?? t0.slice(0, 10)} ✓`);
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      console.warn(`    No events found in scanned range — try a wider window or check the address`);
    }
    console.info('');
  }
}

async function cmdDetect(address: string, chainId: number): Promise<void> {
  if (!CHAINS[chainId]) {
    console.error(`Chain ${chainId} is not in the supported chain list`);
    process.exit(1);
  }

  const env = EnvConfigSchema.parse(process.env);
  const client = createHypersyncClient(chainId, env.ENVIO_API_TOKEN);
  const height = await client.getHeight();
  const toBlock = height;
  const fromBlock = toBlock - 10_000;

  console.info(`Detecting template for ${address} on chain ${chainId} (last 10,000 blocks)…\n`);

  const templateHits = new Map<string, number>();
  const topicCounts = new Map<string, number>();

  for await (const batch of streamLogs(client, {
    addresses: [address],
    fromBlock,
    toBlock,
    fieldSelection: { log: ['Topic0'], block: ['Number'] },
  })) {
    for (const log of batch.logs) {
      const t0 = log.topics[0];
      if (!t0) continue;
      topicCounts.set(t0, (topicCounts.get(t0) ?? 0) + 1);
      const name = KNOWN_TOPIC0S[t0];
      if (name) {
        const template = name.split(' ')[0] as string;
        templateHits.set(template, (templateHits.get(template) ?? 0) + 1);
      }
    }
  }

  if (topicCounts.size === 0) {
    console.info('No events found in the scanned range. Try a wider block range or check the address.');
    return;
  }

  console.info('Top event signatures found:');
  const sorted = Array.from(topicCounts.entries()).sort(([, a], [, b]) => b - a).slice(0, 10);
  for (const [topic0, count] of sorted) {
    const name = KNOWN_TOPIC0S[topic0];
    console.info(`  ${topic0.slice(0, 10)}…  ×${count}  ${name ?? '(unknown)'}`);
  }

  if (templateHits.size > 0) {
    console.info('\nDetected templates:');
    for (const [template, count] of Array.from(templateHits.entries()).sort(([, a], [, b]) => b - a)) {
      console.info(`  ${template}  (${count} matching events)`);
    }
  } else {
    console.info('\nNo known template signatures matched.');
  }
}

async function main(): Promise<void> {
  const subcmd = process.argv[2];

  if (subcmd === 'verify') {
    const id = process.argv[3];
    if (!id) {
      console.error('Usage: pnpm fork verify <id>');
      process.exit(1);
    }
    await cmdVerify(id);
  } else if (subcmd === 'detect') {
    const address = process.argv[3];
    if (!address) {
      console.error('Usage: pnpm fork detect <address> --chain <chainId>');
      process.exit(1);
    }
    let chainId = 1;
    for (let i = 4; i < process.argv.length; i++) {
      if (process.argv[i] === '--chain' && process.argv[i + 1]) {
        chainId = Number(process.argv[++i]);
      }
    }
    await cmdDetect(address, chainId);
  } else {
    console.error('Usage: pnpm fork <verify|detect> …');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
