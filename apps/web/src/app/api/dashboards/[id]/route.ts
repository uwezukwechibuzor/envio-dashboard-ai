import { type NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/index.js';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const rows = await db.select().from(schema.dashboards).where(eq(schema.dashboards.id, id)).limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
  }

  // Increment view count asynchronously (don't await)
  void db
    .update(schema.dashboards)
    .set({ viewCount: sql`${schema.dashboards.viewCount} + 1` })
    .where(eq(schema.dashboards.id, id));

  return NextResponse.json(rows[0]);
}
