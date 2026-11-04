'use client';
import { useState, useCallback } from 'react';
import type { DashboardSpec } from '@envio-dashboard-ai/core';
import type { ProgressEvent, TokenUsage } from '@envio-dashboard-ai/agent';

export type StreamEvent =
  | ProgressEvent
  | { type: 'spec'; spec: DashboardSpec; summary: string; usage: TokenUsage; agentMs: number }
  | { type: 'error'; code: string; message: string };

export type AgentStreamState = {
  isStreaming: boolean;
  events: ProgressEvent[];
  spec: DashboardSpec | null;
  summary: string;
  error: string | null;
  agentMs: number | null;
  usage: TokenUsage | null;
};

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    isStreaming: false,
    events: [],
    spec: null,
    summary: '',
    error: null,
    agentMs: null,
    usage: null,
  });

  const start = useCallback(
    async (
      prompt: string,
      options: {
        previousSpec?: DashboardSpec;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      } = {},
    ) => {
      setState({ isStreaming: true, events: [], spec: null, summary: '', error: null, agentMs: null, usage: null });

      try {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, ...options }),
        });

        if (!response.body) throw new Error('No response body');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data: ')) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(6)) as StreamEvent;
            } catch {
              continue;
            }

            if (event.type === 'spec') {
              setState((prev) => ({
                ...prev,
                isStreaming: false,
                spec: event.spec,
                summary: event.summary,
                agentMs: event.agentMs,
                usage: event.usage,
              }));
            } else if (event.type === 'error') {
              setState((prev) => ({
                ...prev,
                isStreaming: false,
                error: event.message,
              }));
            } else {
              setState((prev) => ({
                ...prev,
                events: [...prev.events, event as ProgressEvent],
              }));
            }
          }
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [],
  );

  return { start, ...state };
}
