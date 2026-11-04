import { HypersyncClient } from '@envio-dev/hypersync-client';
import { getChainInfo } from './chains.js';

const blockRangeCache = new Map<string, { from: number; to: number }>();

export function dateToUtcMidnight(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

export function timestampToDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toISOString().slice(0, 10);
}

export async function getChainHeight(client: HypersyncClient): Promise<number> {
  return client.getHeight();
}

export async function approxBlockAtTimestamp(
  client: HypersyncClient,
  targetUnixSecs: number,
  chainId: number,
): Promise<number> {
  const chain = getChainInfo(chainId);
  const height = await client.getHeight();

  // Query the latest block to get its timestamp
  const res = await client.get({
    fromBlock: height - 1,
    toBlock: height,
    fieldSelection: { block: ['Number', 'Timestamp'] },
    includeAllBlocks: true,
  });

  const latestBlock = res.data.blocks[0];
  if (!latestBlock?.timestamp || !latestBlock.number) return height;

  const nowSecs = latestBlock.timestamp;
  const secondsAgo = nowSecs - targetUnixSecs;
  const blocksAgo = Math.floor((secondsAgo * 1000) / chain.avgBlockTimeMs);

  return Math.max(0, latestBlock.number - blocksAgo);
}

export async function dateRangeToBlockRange(
  client: HypersyncClient,
  fromDate: string,
  toDate: string,
  chainId: number,
): Promise<{ from: number; to: number }> {
  const cacheKey = `${chainId}:${fromDate}:${toDate}`;
  const cached = blockRangeCache.get(cacheKey);
  if (cached) return cached;

  const [fromTs, toTs] = [dateToUtcMidnight(fromDate), dateToUtcMidnight(toDate)];
  const [fromBlock, toBlock] = await Promise.all([
    approxBlockAtTimestamp(client, fromTs, chainId),
    approxBlockAtTimestamp(client, toTs, chainId),
  ]);

  const result = { from: fromBlock, to: toBlock + 1 }; // toBlock is exclusive
  blockRangeCache.set(cacheKey, result);
  return result;
}
