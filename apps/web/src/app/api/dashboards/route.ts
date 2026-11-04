import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { DashboardSpecSchema } from '@envio-dashboard-ai/core';
import { db, schema } from '@/lib/db/index.js';
import { auth } from '@/lib/auth.js';

const CreateSchema = z.object({
  spec: DashboardSpecSchema,
  summary: z.string(),
  prompt: z.string().min(1),
  agentMs: z.number().optional(),
  eventCount: z.number().optional(),
  forkedFromId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const id = nanoid(8);

  await db.insert(schema.dashboards).values({
    id,
    userId,
    spec: body.spec,
    summary: body.summary,
    prompt: body.prompt,
    agentMs: body.agentMs ?? null,
    eventCount: body.eventCount ?? null,
    forkedFromId: body.forkedFromId ?? null,
  });

  return NextResponse.json({ id }, { status: 201 });
}
