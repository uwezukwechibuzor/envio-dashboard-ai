/**
 * Telemetry abstraction.
 *
 * In production wire in the OpenTelemetry SDK by setting the OTEL_* env vars
 * and importing @opentelemetry/sdk-node before the app starts. This module
 * provides a no-op tracer that is replaced automatically when OTEL is active.
 *
 * Usage:
 *   import { tracer, recordMetric } from '@envio-dashboard-ai/core/telemetry';
 *   const span = tracer.startActiveSpan('agent.tool_call', (span) => { ... });
 */

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(err: Error): void;
  setStatus(status: { code: SpanStatusCode; message?: string }): void;
  end(): void;
}

export enum SpanStatusCode {
  OK = 1,
  ERROR = 2,
}

type SpanCallback<T> = (span: Span) => T;

function noopSpan(): Span {
  return {
    setAttribute: () => undefined,
    recordException: () => undefined,
    setStatus: () => undefined,
    end: () => undefined,
  };
}

class NoopTracer {
  startActiveSpan<T>(name: string, fn: SpanCallback<T>): T;
  startActiveSpan<T>(name: string, _opts: object, fn: SpanCallback<T>): T;
  startActiveSpan<T>(_name: string, fnOrOpts: SpanCallback<T> | object, maybeFn?: SpanCallback<T>): T {
    const fn = typeof fnOrOpts === 'function' ? fnOrOpts : maybeFn!;
    return fn(noopSpan());
  }
}

// In production: replace with `trace.getTracer('envio-dashboard-ai')` from @opentelemetry/api
export const tracer = new NoopTracer();

export interface Histogram {
  record(value: number, attributes?: Record<string, string | number>): void;
}

class NoopHistogram implements Histogram {
  record(): void {}
}

// Key histograms — wired to OTEL in production via @opentelemetry/sdk-node
export const metrics = {
  toolLatencyMs: new NoopHistogram() as Histogram,
  hypersyncBytesReceived: new NoopHistogram() as Histogram,
  hypersyncEventsReceived: new NoopHistogram() as Histogram,
  llmInputTokens: new NoopHistogram() as Histogram,
  llmOutputTokens: new NoopHistogram() as Histogram,
  cacheHitRate: new NoopHistogram() as Histogram,
};

export function recordMetric(name: keyof typeof metrics, value: number, attrs?: Record<string, string | number>): void {
  metrics[name].record(value, attrs);
}

/** Wrap an async fn with a tracing span. Attributes on the returned span. */
export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span: Span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      if (err instanceof Error) span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
