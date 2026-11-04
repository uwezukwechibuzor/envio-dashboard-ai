import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import type { DashboardSpec } from '@envio-dashboard-ai/core';

export const dashboards = pgTable('dashboards', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  spec: jsonb('spec').notNull().$type<DashboardSpec>(),
  summary: text('summary').notNull().default(''),
  prompt: text('prompt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  viewCount: integer('view_count').default(0).notNull(),
  forkedFromId: text('forked_from_id'),
  agentMs: integer('agent_ms'),
  eventCount: integer('event_count'),
});

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').default(0).notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});
