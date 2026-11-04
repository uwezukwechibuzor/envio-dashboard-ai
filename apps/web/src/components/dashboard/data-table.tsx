'use client';
import type { MetricUnit } from '@envio-dashboard-ai/core';
import { formatChartValue, pointValueToNumber } from '@/lib/format.js';
import { Button } from '@/components/ui/button.js';

type Props = {
  points: Array<{ date: string; value: string }>;
  unit: MetricUnit;
  title: string;
};

function toCsv(points: Array<{ date: string; value: string }>, unit: MetricUnit): string {
  const header = 'date,value\n';
  const rows = points.map((p) => `${p.date},${formatChartValue(pointValueToNumber(p.value, unit), unit)}`).join('\n');
  return header + rows;
}

export function DataTable({ points, unit, title }: Props) {
  function downloadCsv() {
    const csv = toCsv(points, unit);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border))]">
              <th className="text-left px-4 py-2 text-[rgb(var(--muted))] font-medium">Date</th>
              <th className="text-right px-4 py-2 text-[rgb(var(--muted))] font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--card))]">
                <td className="px-4 py-1.5 tabular-nums">{p.date}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">
                  {formatChartValue(pointValueToNumber(p.value, unit), unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3">
        <Button variant="ghost" size="sm" onClick={downloadCsv} aria-label={`Download ${title} as CSV`}>
          ↓ CSV
        </Button>
      </div>
    </div>
  );
}
