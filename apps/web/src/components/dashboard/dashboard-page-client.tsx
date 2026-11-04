'use client';
import { useState } from 'react';
import type { DashboardSpec } from '@envio-dashboard-ai/core';
import { DashboardView } from './dashboard-view.js';
import { ChatPanel } from '@/components/chat/chat-panel.js';
import { Button } from '@/components/ui/button.js';
import { ThemeToggle } from '@/components/ui/theme-toggle.js';
import { useAgentStream } from '@/hooks/use-agent-stream.js';

type DashboardRow = {
  id: string;
  spec: DashboardSpec;
  summary: string;
  prompt: string;
  agentMs: number | null;
};

type Props = {
  dashboard: DashboardRow;
  shareId: string;
};

export function DashboardPageClient({ dashboard, shareId }: Props) {
  const [spec, setSpec] = useState<DashboardSpec>(dashboard.spec);
  const [agentMs, setAgentMs] = useState<number | null>(dashboard.agentMs);
  const [forkId, setForkId] = useState<string | null>(null);
  const stream = useAgentStream();

  if (stream.spec && stream.spec !== spec) {
    setSpec(stream.spec);
    setAgentMs(stream.agentMs);
  }

  async function handleFork() {
    const res = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec,
        summary: dashboard.summary,
        prompt: dashboard.prompt,
        forkedFromId: shareId,
      }),
    });
    const data = await res.json() as { id: string };
    if (data.id) {
      setForkId(data.id);
      window.location.href = `/d/${data.id}`;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[rgb(var(--border))] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="font-bold text-[rgb(var(--accent))]">Envio</a>
          <span className="text-[rgb(var(--muted))]">/</span>
          <span className="text-sm truncate max-w-xs">{spec.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void handleFork()} loading={!!forkId}>
            Fork dashboard
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <DashboardView spec={spec} agentMs={agentMs} shareId={shareId} />
          <div className="lg:sticky lg:top-4 h-fit">
            <div className="rounded-xl border border-[rgb(var(--border))] p-4">
              <h2 className="text-sm font-semibold mb-3">Refine dashboard</h2>
              <ChatPanel
                currentSpec={spec}
                streamState={stream}
                onSubmit={(p, history, prev) => void stream.start(p, { previousSpec: prev ?? undefined, history })}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
