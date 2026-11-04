import { db, schema } from './db/index.js';
import { eq, sql } from 'drizzle-orm';

export type LimitConfig = {
  maxRequests: number;
  windowSeconds: number;
};

export const ANON_LIMIT: LimitConfig = { maxRequests: 5, windowSeconds: 86400 };
export const USER_LIMIT: LimitConfig = { maxRequests: 50, windowSeconds: 86400 };

export async function checkRateLimit(
  key: string,
  config: LimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + config.windowSeconds * 1000);

  // Try to fetch the existing record
  const existing = await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, key)).limit(1);

  if (existing.length === 0 || existing[0]!.resetAt < now) {
    // No record or expired — create/reset
    await db
      .insert(schema.rateLimits)
      .values({ key, count: 1, resetAt: windowEnd })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: 1, resetAt: windowEnd } });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: windowEnd };
  }

  const current = existing[0]!;
  if (current.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  await db
    .update(schema.rateLimits)
    .set({ count: sql`${schema.rateLimits.count} + 1` })
    .where(eq(schema.rateLimits.key, key));

  return { allowed: true, remaining: config.maxRequests - current.count - 1, resetAt: current.resetAt };
}
