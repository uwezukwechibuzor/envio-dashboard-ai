'use client';
import { useQuery } from '@tanstack/react-query';
import type { MetricSeries } from '@envio-dashboard-ai/core';

export type MetricResult = MetricSeries & { error?: { code: string; message: string } };

export function useMetric(tool: string, args: Record<string, unknown>) {
  return useQuery<MetricResult>({
    queryKey: ['metric', tool, args],
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/metric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, args }),
        signal,
      });
      const json = await res.json() as MetricResult;
      return json;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
