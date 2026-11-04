import { z } from 'zod';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export const MetricSeriesPointSchema = z.object({
  date: z.string().regex(YYYY_MM_DD, 'Must be YYYY-MM-DD'),
  value: z.string(), // BigInt serialised as decimal string
});
export type MetricSeriesPoint = z.infer<typeof MetricSeriesPointSchema>;

export const MetricUnitSchema = z.enum(['usd', 'token', 'count', 'gas']);
export type MetricUnit = z.infer<typeof MetricUnitSchema>;

export const DataSourceSchema = z.enum(['hypersync', 'indexer']);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const MetricSeriesSchema = z.object({
  protocol: z.string(),
  chain: z.number().int().positive(),
  metric: z.string(),
  unit: MetricUnitSchema,
  points: z.array(MetricSeriesPointSchema),
  asOfBlock: z.number().int().nonnegative(),
  asOfTimestamp: z.number().int().nonnegative(), // Unix seconds
  source: DataSourceSchema,
  methodology: z.string(),
});
export type MetricSeries = z.infer<typeof MetricSeriesSchema>;

export const DateRangeSchema = z.object({
  from: z.string().regex(YYYY_MM_DD, 'Must be YYYY-MM-DD'),
  to: z.string().regex(YYYY_MM_DD, 'Must be YYYY-MM-DD'),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const BlockRangeSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
});
export type BlockRange = z.infer<typeof BlockRangeSchema>;

export const ChainEntrySchema = z.object({
  startBlock: z.number().int().nonnegative(),
  contracts: z.array(z.string().regex(HEX_ADDRESS)).optional(),
  factories: z.array(z.string().regex(HEX_ADDRESS)).optional(),
});
export type ChainEntry = z.infer<typeof ChainEntrySchema>;

export const MetricEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  methodology: z.string(),
  source: DataSourceSchema,
  unit: MetricUnitSchema,
});
export type MetricEntry = z.infer<typeof MetricEntrySchema>;

export const ProtocolPackMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  chains: z.record(z.string(), ChainEntrySchema), // key = chainId as string
  metrics: z.record(z.string(), MetricEntrySchema),
});
export type ProtocolPackMeta = z.infer<typeof ProtocolPackMetaSchema>;

export const EnvConfigSchema = z.object({
  ENVIO_API_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().optional(),
  AGENT_MAX_TURNS: z.coerce.number().int().positive().default(20),
});
export type EnvConfig = z.infer<typeof EnvConfigSchema>;
