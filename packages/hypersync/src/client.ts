import {
  HypersyncClient,
  type Query,
  type LogFilter,
  type FieldSelection,
  type Log,
  type Block,
} from '@envio-dev/hypersync-client';
import { UpstreamError } from '@envio-dashboard-ai/core';
import { getChainInfo } from './chains.js';

export type LogQueryParams = {
  addresses?: string[];
  topics?: (string | null)[][];
  fromBlock: number;
  toBlock: number;
  fieldSelection?: FieldSelection;
};

export type LogBatch = {
  logs: Log[];
  blockTimestamps: Map<number, number>; // blockNumber → Unix seconds
  nextBlock: number;
  archiveHeight: number;
};

export function createHypersyncClient(chainId: number, apiToken: string): HypersyncClient {
  const chain = getChainInfo(chainId);
  return new HypersyncClient({ url: chain.url, apiToken });
}

export async function* streamLogs(
  client: HypersyncClient,
  params: LogQueryParams,
): AsyncGenerator<LogBatch> {
  const filter: LogFilter = {};
  if (params.addresses?.length) filter.address = params.addresses;
  if (params.topics?.length) filter.topics = params.topics as string[][];

  const fieldSelection: FieldSelection = params.fieldSelection ?? {
    log: ['BlockNumber', 'TransactionHash', 'Address', 'Data', 'Topic0', 'Topic1', 'Topic2', 'Topic3'],
    block: ['Number', 'Timestamp'],
  };

  let fromBlock = params.fromBlock;

  while (true) {
    const query: Query = {
      fromBlock,
      toBlock: params.toBlock,
      logs: [filter],
      fieldSelection,
    };

    let res;
    try {
      res = await client.get(query);
    } catch (err) {
      throw new UpstreamError(
        `HyperSync query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const blockTimestamps = new Map<number, number>();
    for (const block of res.data.blocks) {
      if (block.number !== undefined && block.timestamp !== undefined) {
        blockTimestamps.set(block.number, block.timestamp);
      }
    }

    yield {
      logs: res.data.logs,
      blockTimestamps,
      nextBlock: res.nextBlock,
      archiveHeight: res.archiveHeight ?? res.nextBlock,
    };

    if (res.nextBlock >= params.toBlock) break;
    // Never stop on empty pages — gaps are real, keep going
    fromBlock = res.nextBlock;
  }
}

export { type Log, type Block };
