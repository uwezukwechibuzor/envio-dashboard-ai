import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { DashboardSpecSchema } from '@envio-dashboard-ai/core';
import { runAgent } from '@envio-dashboard-ai/agent';
import { auth } from '@/lib/auth.js';
import { checkRateLimit, ANON_LIMIT, USER_LIMIT } from '@/lib/rate-limit.js';

// Load protocol registry on first request
import '@envio-dashboard-ai/metrics';

const RequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  previousSpec: DashboardSpecSchema.optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional(),
});

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  function send(controller: ReadableStreamDefaultController, event: unknown): void {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const rateLimitKey = userId ? `user:${userId}` : `ip:${ip}`;
  const limitConfig = userId ? USER_LIMIT : ANON_LIMIT;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Rate limit check
        const { allowed, remaining } = await checkRateLimit(rateLimitKey, limitConfig);
        if (!allowed) {
          send(controller, { type: 'error', code: 'RATE_LIMITED', message: `Rate limit exceeded. Remaining: ${remaining}. Sign in for higher limits.` });
          controller.close();
          return;
        }

        // Parse request body
        let body: z.infer<typeof RequestSchema>;
        try {
          body = RequestSchema.parse(await request.json());
        } catch {
          send(controller, { type: 'error', code: 'INVALID_REQUEST', message: 'Invalid request body' });
          controller.close();
          return;
        }

        const startMs = Date.now();

        const result = await runAgent(body.prompt, {
          userId: userId ?? ip,
          previousSpec: body.previousSpec,
          history: body.history,
          onProgress: (event) => {
            send(controller, event);
          },
        });

        const agentMs = Date.now() - startMs;

        send(controller, {
          type: 'spec',
          spec: result.spec,
          summary: result.summary,
          usage: result.usage,
          agentMs,
        });
      } catch (err) {
        send(controller, {
          type: 'error',
          code: 'AGENT_ERROR',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
