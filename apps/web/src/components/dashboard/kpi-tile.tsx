'use client';
import type { MetricUnit } from '@envio-dashboard-ai/core';
import { formatChartValue, pointValueToNumber, sumPoints } from '@/lib/format.js';
import { FreshnessBadge } from './freshness-badge.js';

type Props = {
  title: string;
  points: Array<{ date: string; value: string }>;
  unit: MetricUnit;
  asOfBlock: number;
  asOfTimestamp: number;
  source: string;
};

export function KpiTile({ title, points, unit, asOfBlock, asOfTimestamp, source }: Props) {
  const totalBig = sumPoints(points);
  const displayValue = formatChartValue(pointValueToNumber(totalBig.toString(), unit), unit);

  return (
    <div className="flex flex-col gap-1 p-4">
      <div
        className="text-3xl font-bold tabular-nums"
        aria-label={`${title}: ${displayValue}`}
      >
        {displayValue}
      </div>
      <FreshnessBadge asOfBlock={asOfBlock} asOfTimestamp={asOfTimestamp} source={source} />
    </div>
  );
}
