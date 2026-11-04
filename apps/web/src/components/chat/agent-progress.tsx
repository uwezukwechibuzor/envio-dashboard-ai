'use client';
import type { ProgressEvent } from '@envio-dashboard-ai/agent';

type Props = { events: ProgressEvent[]; isStreaming: boolean };

function labelForEvent(event: ProgressEvent): string {
  switch (event.type) {
    case 'tool_call': return `→ ${event.toolName}(${JSON.stringify(event.args).slice(0, 60)}…)`;
    case 'tool_result': return `← ${event.toolCallId.slice(-8)} ${event.success ? '✓' : '✗'}`;
    case 'validating_spec': return 'Validating spec…';
    case 'spec_invalid': return `Spec invalid, retrying (attempt ${event.attempt})`;
    case 'done': return `Done — ${event.spec.widgets.length} widgets`;
  }
}

export function AgentProgress({ events, isStreaming }: Props) {
  if (events.length === 0 && !isStreaming) return null;

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Agent progress"
      className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 space-y-1 text-xs font-mono max-h-64 overflow-y-auto"
    >
      {events.map((e, i) => (
        <div key={i} className="text-[rgb(var(--muted))]">
          {labelForEvent(e)}
        </div>
      ))}
      {isStreaming && (
        <div className="flex items-center gap-2 text-[rgb(var(--accent))]">
          <span className="size-3 border-2 border-[rgb(var(--accent))] border-t-transparent rounded-full animate-spin" aria-hidden />
          Building dashboard…
        </div>
      )}
    </div>
  );
}
