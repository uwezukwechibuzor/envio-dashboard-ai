'use client';
import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { DashboardWidget } from '@envio-dashboard-ai/core';
import { Tooltip } from '@/components/ui/tooltip.js';
import { Button } from '@/components/ui/button.js';
import { useMetric, type MetricResult } from '@/hooks/use-metric.js';
import { KpiTile } from './kpi-tile.js';
import { MetricChart } from './metric-chart.js';
import { DataTable } from './data-table.js';

type Props = {
  widget: DashboardWidget;
};

export function WidgetWrapper({ widget }: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const primary = useMetric(widget.query.tool, widget.query.args);
  const compareResults = useQueries({
    queries: (widget.compareWith ?? []).map((cw) => ({
      queryKey: ['metric', cw.tool, cw.args],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const res = await fetch('/api/metric', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: cw.tool, args: cw.args }),
          signal,
        });
        return res.json() as Promise<MetricResult>;
      },
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const isLoading = primary.isLoading;
  const error = primary.error ?? (primary.data?.error ? new Error(primary.data.error.message) : null);
  const series = primary.data;

  const compareSeries = compareResults
    .map((r, i) => ({ data: r.data, label: widget.compareWith?.[i]?.label ?? `Compare ${i + 1}` }))
    .filter((x) => x.data && !x.data.error);

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--border))]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{widget.title}</h3>
          {series?.methodology && (
            <Tooltip content={series.methodology}>
              <button
                className="size-4 rounded-full bg-[rgb(var(--card))] text-[rgb(var(--muted))] text-xs flex items-center justify-center hover:text-[rgb(var(--fg))]"
                aria-label="View methodology"
              >
                ?
              </button>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1">
          {widget.type !== 'kpi' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView('chart')}
                className={view === 'chart' ? 'text-[rgb(var(--accent))]' : ''}
                aria-pressed={view === 'chart'}
              >
                Chart
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView('table')}
                className={view === 'table' ? 'text-[rgb(var(--accent))]' : ''}
                aria-pressed={view === 'table'}
              >
                Table
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-[120px]">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <span className="size-5 border-2 border-[rgb(var(--accent))] border-t-transparent rounded-full animate-spin" aria-label="Loading" />
          </div>
        )}

        {error && !isLoading && (
          <div className="p-4 text-sm text-red-500" role="alert">
            Failed to load: {error.message}
          </div>
        )}

        {series && !isLoading && !error && (
          <>
            {widget.type === 'kpi' ? (
              <KpiTile
                title={widget.title}
                points={series.points}
                unit={series.unit}
                asOfBlock={series.asOfBlock}
                asOfTimestamp={series.asOfTimestamp}
                source={series.source}
              />
            ) : view === 'table' ? (
              <DataTable points={series.points} unit={series.unit} title={widget.title} />
            ) : (
              <MetricChart
                type={widget.type}
                series={[
                  { points: series.points, unit: series.unit, asOfBlock: series.asOfBlock, asOfTimestamp: series.asOfTimestamp, source: series.source },
                  ...compareSeries.map((cs) => ({
                    points: cs.data!.points,
                    unit: cs.data!.unit,
                    label: cs.label,
                    asOfBlock: cs.data!.asOfBlock,
                    asOfTimestamp: cs.data!.asOfTimestamp,
                    source: cs.data!.source,
                  })),
                ]}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
