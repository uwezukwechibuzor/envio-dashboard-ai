import { z } from 'zod';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const ForkTemplateSchema = z.enum([
  'dex-v2',
  'dex-v3',
  'lending-aave',
  'lending-compound',
  'vault-erc4626',
]);
export type ForkTemplate = z.infer<typeof ForkTemplateSchema>;

export const ForkChainConfigSchema = z.object({
  startBlock: z.number().int().nonnegative(),
  factory: z.string().regex(HEX_ADDRESS).optional(),
  pool: z.string().regex(HEX_ADDRESS).optional(),
  comptroller: z.string().regex(HEX_ADDRESS).optional(),
  vaults: z.array(z.string().regex(HEX_ADDRESS)).optional(),
});
export type ForkChainConfig = z.infer<typeof ForkChainConfigSchema>;

export const ForkConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  template: ForkTemplateSchema,
  parentProtocol: z.string().optional(),
  chains: z.record(z.string(), ForkChainConfigSchema),
  feeBps: z.number().int().min(0).max(10000).optional(),
  protocolFeeShare: z.number().min(0).max(1).optional(),
  eventSignatureOverrides: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});
export type ForkConfig = z.infer<typeof ForkConfigSchema>;
