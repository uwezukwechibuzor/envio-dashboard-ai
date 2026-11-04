/**
 * Error tracking / Sentry shim.
 *
 * In production install @sentry/nextjs and set SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN.
 * Until then, errors are logged as structured JSON to stdout so they can be
 * captured by any log aggregator (Datadog, Logtail, Railway Logs, etc.).
 */

export interface ErrorContext {
  userId?: string;
  route?: string;
  [key: string]: string | number | boolean | undefined;
}

function structuredLog(level: 'error' | 'warn', message: string, ctx?: ErrorContext): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'envio-dashboard-ai-web',
    ...ctx,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.warn(JSON.stringify(entry));
  }
}

export function captureException(err: unknown, ctx?: ErrorContext): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // If Sentry is wired in (production), delegate to it.
  // The global Sentry object is injected by sentry.server.config.ts when the
  // SENTRY_DSN env var is set.
  const globalSentry = (globalThis as Record<string, unknown>)['__sentryCapture'];
  if (typeof globalSentry === 'function') {
    (globalSentry as (err: unknown, ctx?: ErrorContext) => void)(err, ctx);
    return;
  }

  structuredLog('error', message, { ...ctx, stack });
}

export function captureMessage(message: string, level: 'info' | 'warning' = 'info', ctx?: ErrorContext): void {
  structuredLog(level === 'warning' ? 'warn' : 'error', message, ctx);
}

export function withErrorBoundary<T>(
  fn: () => Promise<T>,
  ctx?: ErrorContext,
): Promise<T> {
  return fn().catch((err: unknown) => {
    captureException(err, ctx);
    throw err;
  });
}
