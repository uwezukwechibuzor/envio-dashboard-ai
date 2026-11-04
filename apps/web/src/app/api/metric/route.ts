import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TOOL_EXECUTORS } from '@envio-dashboard-ai/agent';

import '@envio-dashboard-ai/metrics';

const RequestSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const executor = TOOL_EXECUTORS.get(body.tool);
  if (!executor) {
    return NextResponse.json({ error: `Unknown tool: ${body.tool}` }, { status: 400 });
  }

  const result = await executor(body.args);
  let data: unknown = JSON.parse(result.content);

  // Unwrap safety envelope from on-chain tools
  if (
    data !== null &&
    typeof data === 'object' &&
    '_untrusted_on_chain_data' in (data as Record<string, unknown>) &&
    'data' in (data as Record<string, unknown>)
  ) {
    data = (data as Record<string, unknown>)['data'];
  }

  if (result.isError) {
    return NextResponse.json(data, { status: 422 });
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
    },
  });
}
