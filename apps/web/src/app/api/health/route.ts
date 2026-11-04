import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/index.js';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HealthStatus = 'ok' | 'degraded' | 'down';

async function checkDb(): Promise<HealthStatus> {
  try {
    await db.select({ one: sql<number>`1` }).from(schema.dashboards).limit(1);
    return 'ok';
  } catch {
    return 'down';
  }
}

async function checkHyperSync(): Promise<HealthStatus> {
  try {
    const res = await fetch('https://eth.hypersync.xyz/height', {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? 'ok' : 'degraded';
  } catch {
    return 'down';
  }
}

function checkAgent(): HealthStatus {
  return process.env['ANTHROPIC_API_KEY'] ? 'ok' : 'down';
}

export async function GET() {
  const [db_status, hypersync, agent] = await Promise.all([
    checkDb(),
    checkHyperSync(),
    Promise.resolve(checkAgent()),
  ]);

  const overall: HealthStatus =
    db_status === 'down' || hypersync === 'down' || agent === 'down'
      ? 'down'
      : db_status === 'degraded' || hypersync === 'degraded'
        ? 'degraded'
        : 'ok';

  const status = overall === 'ok' ? 200 : overall === 'degraded' ? 200 : 503;
  return NextResponse.json({ status: overall, checks: { db: db_status, hypersync, agent } }, { status });
}
