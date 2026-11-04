'use client';
import type { DashboardSpec } from '@envio-dashboard-ai/core';
import { WidgetWrapper } from './widget-wrapper.js';
import { EnvioUpsell } from './envio-upsell.js';
import { Button } from '@/components/ui/button.js';

type Props = {
  spec: DashboardSpec;
  agentMs?: number | null;
  onSave?: () => void;
  shareId?: string;
};

export function DashboardView({ spec, agentMs, onSave, shareId }: Props) {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  async function copyLink() {
    if (shareId) {
      await navigator.clipboard.writeText(`${appUrl}/d/${shareId}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{spec.title}</h1>
          {spec.description && (
            <p className="text-sm text-[rgb(var(--muted))] mt-1 max-w-2xl">{spec.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {spec.chains.map((c) => (
              <span
                key={c}
                className="text-xs bg-[rgb(var(--card))] border border-[rgb(var(--border))] rounded-full px-2 py-0.5"
              >
                chain:{c}
              </span>
            ))}
            <span className="text-xs text-[rgb(var(--muted))]">
              {spec.timeRange.fromDate} → {spec.timeRange.toDate}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onSave && (
            <Button variant="secondary" size="sm" onClick={onSave}>
              Save
            </Button>
          )}
          {shareId && (
            <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
              Copy link
            </Button>
          )}
          {shareId && (
            <a
              href={`${appUrl}/d/${shareId}`}
              className="text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]"
              aria-label="Open shareable link"
            >
              /d/{shareId}
            </a>
          )}
        </div>
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {spec.widgets.map((widget, i) => (
          <div
            key={i}
            className={widget.type === 'kpi' ? '' : 'md:col-span-2'}
          >
            <WidgetWrapper widget={widget} />
          </div>
        ))}
      </div>

      {/* Methodology notes */}
      {spec.methodologyNotes.length > 0 && (
        <details className="text-xs text-[rgb(var(--muted))] border border-[rgb(var(--border))] rounded-lg p-3">
          <summary className="cursor-pointer font-medium">Methodology</summary>
          <ul className="mt-2 list-disc list-inside space-y-1">
            {spec.methodologyNotes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </details>
      )}

      {/* Envio upsell */}
      <EnvioUpsell spec={spec} agentMs={agentMs} />
    </div>
  );
}
