import { pgTable, text, integer, bigint, index, unique } from 'drizzle-orm/pg-core';

export const metricSeries = pgTable(
  'metric_series',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    protocol: text('protocol').notNull(),
    chainId: integer('chain_id').notNull(),
    metric: text('metric').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    value: text('value').notNull(), // BigInt as decimal string
    source: text('source').notNull(), // 'hypersync' | 'indexer'
    asOfBlock: integer('as_of_block').notNull(),
  },
  (t) => [
    unique('metric_series_unique').on(t.protocol, t.chainId, t.metric, t.date),
    index('metric_series_lookup').on(t.protocol, t.chainId, t.metric),
  ],
);

export const blockRangeCache = pgTable(
  'block_range_cache',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    chainId: integer('chain_id').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD → start block of that day
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    unique('block_range_cache_unique').on(t.chainId, t.date),
  ],
);
