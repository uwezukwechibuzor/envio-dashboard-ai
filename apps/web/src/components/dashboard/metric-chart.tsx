'use client';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import type { MetricUnit, WidgetType } from '@envio-dashboard-ai/core';
import { formatChartValue, pointValueToNumber } from '@/lib/format.js';
import { FreshnessBadge } from './freshness-badge.js';

type DataPoint = { date: string; value: string };

type SeriesData = {
  points: DataPoint[];
  unit: MetricUnit;
  label?: string;
  asOfBlock: number;
  asOfTimestamp: number;
  source: string;
};

type Props = {
  type: WidgetType;
  series: SeriesData[];
};

const COLORS = ['#FF6B2B', '#6366F1', '#22C55E', '#F59E0B', '#EC4899'];

function toChartData(series: SeriesData[]) {
  if (series.length === 0) return [];
  const primary = series[0]!;
  return primary.points.map((p, i) => {
    const row: Record<string, string | number> = { date: p.date.slice(5) }; // MM-DD
    series.forEach((s, si) => {
      const pt = s.points[i];
      row[`v${si}`] = pt ? pointValueToNumber(pt.value, s.unit) : 0;
    });
    return row;
  });
}

function tickFormatter(value: number, unit: MetricUnit): string {
  return formatChartValue(value, unit);
}

export function MetricChart({ type, series }: Props) {
  if (series.length === 0) return <div className="p-4 text-[rgb(var(--muted))] text-sm">No data</div>;

  const primary = series[0]!;
  const unit = primary.unit;
  const data = toChartData(series);
  const tooltipFormatter = (value: number) => formatChartValue(value, unit);
  const yFormatter = (v: number) => tickFormatter(v, unit);

  const commonProps = {
    data,
    margin: { top: 4, right: 8, left: 8, bottom: 4 },
  };

  const axisProps = {
    xAxis: <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />,
    yAxis: <YAxis tickFormatter={yFormatter} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />,
    grid: <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />,
    tooltip: (
      <RTooltip
        formatter={tooltipFormatter}
        labelStyle={{ fontSize: 12 }}
        contentStyle={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
      />
    ),
  };

  const chartContent = (() => {
    if (type === 'pie') {
      const pieData = primary.points.map((p) => ({
        name: p.date.slice(5),
        value: pointValueToNumber(p.value, unit),
      }));
      return (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
              {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <RTooltip formatter={tooltipFormatter} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (type === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart {...commonProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}
            {series.map((s, i) => (
              <Bar key={i} dataKey={`v${i}`} name={s.label ?? 'Value'} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} />
            ))}
            {series.length > 1 && <Legend />}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (type === 'stacked' || type === 'area') {
      return (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart {...commonProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}
            {series.map((s, i) => (
              <Area
                key={i}
                type="monotone"
                dataKey={`v${i}`}
                name={s.label ?? 'Value'}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.15}
                stackId={type === 'stacked' ? 'stack' : undefined}
              />
            ))}
            {series.length > 1 && <Legend />}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    // Default: line chart
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart {...commonProps}>
          {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}
          {series.map((s, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={`v${i}`}
              name={s.label ?? 'Value'}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
            />
          ))}
          {series.length > 1 && <Legend />}
        </LineChart>
      </ResponsiveContainer>
    );
  })();

  return (
    <div>
      <div tabIndex={0} role="img" aria-label={`${type} chart`}>
        {chartContent}
      </div>
      <div className="px-4 pb-3 mt-1">
        <FreshnessBadge
          asOfBlock={primary.asOfBlock}
          asOfTimestamp={primary.asOfTimestamp}
          source={primary.source}
        />
      </div>
    </div>
  );
}
