import { z } from 'zod';
import { MetricUnitSchema } from './schemas.js';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export const WidgetTypeSchema = z.enum(['kpi', 'line', 'bar', 'stacked', 'area', 'table', 'pie']);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

export const WidgetQueryRefSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  toolCallId: z.string().min(1),
});
export type WidgetQueryRef = z.infer<typeof WidgetQueryRefSchema>;

export const CompareRefSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  toolCallId: z.string().min(1),
  label: z.string().min(1),
});
export type CompareRef = z.infer<typeof CompareRefSchema>;

export const WidgetDisplaySchema = z.object({
  unit: MetricUnitSchema.optional(),
  format: z.enum(['number', 'currency', 'percent', 'compact']).default('number'),
  stackBy: z.string().optional(),
  compareMode: z.enum(['absolute', 'percent']).optional(),
});
export type WidgetDisplay = z.infer<typeof WidgetDisplaySchema>;

export const DashboardWidgetSchema = z.object({
  type: WidgetTypeSchema,
  title: z.string().min(1),
  query: WidgetQueryRefSchema,
  compareWith: z.array(CompareRefSchema).optional(),
  display: WidgetDisplaySchema,
});
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

export const DashboardSpecSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  timeRange: z.object({
    fromDate: z.string().regex(YYYY_MM_DD, 'Must be YYYY-MM-DD'),
    toDate: z.string().regex(YYYY_MM_DD, 'Must be YYYY-MM-DD'),
  }),
  chains: z.array(z.number().int().positive()).min(1),
  widgets: z.array(DashboardWidgetSchema).min(1),
  methodologyNotes: z.array(z.string()),
  generatedAt: z.string().min(1),
});
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;
