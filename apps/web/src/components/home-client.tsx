'use client';
import { useState, useRef, useCallback } from 'react';
import type { DashboardSpec } from '@envio-dashboard-ai/core';
import { DashboardView } from '@/components/dashboard/dashboard-view.js';
import { ChatPanel } from '@/components/chat/chat-panel.js';
import { ExampleChips } from '@/components/chat/example-chips.js';
import { ThemeToggle } from '@/components/ui/theme-toggle.js';
import { Button } from '@/components/ui/button.js';
import { useAgentStream } from '@/hooks/use-agent-stream.js';

type HistoryEntry = { role: 'user' | 'assistant'; content: string };

export function HomeClient() {
  const [prompt, setPrompt] = useState('');
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [agentMs, setAgentMs] = useState<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const stream = useAgentStream();

  const handleSubmit = useCallback(
    async (
      p: string,
      history: HistoryEntry[] = [],
      previousSpec: DashboardSpec | null = null,
    ) => {
      setShareId(null);
      await stream.start(p, { previousSpec: previousSpec ?? undefined, history });
    },
    [stream],
  );

  // Keep local spec in sync with stream results
  if (stream.spec && stream.spec !== spec) {
    setSpec(stream.spec);
    setAgentMs(stream.agentMs);
  }

  async function handleSave() {
    if (!spec) return;
    const res = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec, summary: stream.summary ?? '', prompt, agentMs }),
    });
    const data = await res.json() as { id: string };
    if (data.id) setShareId(data.id);
  }

  const hasSpec = spec !== null;
  const isLoading = stream.isStreaming;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-[rgb(var(--border))] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[rgb(var(--accent))]">Envio</span>
          <span className="text-[rgb(var(--muted))]">Dashboard AI</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        {/* Hero prompt box — always visible */}
        {!hasSpec && (
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h1 className="text-4xl font-bold tracking-tight">
              Generate a live DeFi{' '}
              <span className="text-[rgb(var(--accent))]">analytics dashboard</span>
            </h1>
            <p className="text-[rgb(var(--muted))]">
              Describe what you want. Powered by{' '}
              <a href="https://docs.envio.dev" className="text-[rgb(var(--accent))] hover:underline" target="_blank" rel="noreferrer">
                Envio HyperSync
              </a>
              .
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit(prompt);
              }}
              className="flex flex-col gap-3"
            >
              <textarea
                ref={textRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(prompt);
                  }
                }}
                placeholder='e.g. "Generate me a Uniswap V3 dashboard on Ethereum and Arbitrum"'
                rows={3}
                disabled={isLoading}
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-4 py-3 text-sm resize-none focus:outline-none focus:border-[rgb(var(--accent))] disabled:opacity-50"
                aria-label="Dashboard prompt"
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                disabled={!prompt.trim()}
              >
                Generate dashboard
              </Button>
            </form>

            <ExampleChips
              onSelect={(p) => {
                setPrompt(p);
                void handleSubmit(p);
              }}
            />
          </div>
        )}

        {/* Dashboard + chat layout */}
        {hasSpec && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Dashboard */}
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSpec(null); setPrompt(''); setShareId(null); }}
                >
                  ← New dashboard
                </Button>
              </div>
              <DashboardView
                spec={spec}
                agentMs={agentMs}
                onSave={() => void handleSave()}
                shareId={shareId ?? undefined}
              />
            </div>

            {/* Chat side panel */}
            <div className="lg:sticky lg:top-4 h-fit space-y-4">
              <div className="rounded-xl border border-[rgb(var(--border))] p-4">
                <h2 className="text-sm font-semibold mb-3">Refine dashboard</h2>
                <ChatPanel
                  currentSpec={spec}
                  streamState={stream}
                  onSubmit={(p, history, prev) => void handleSubmit(p, history, prev)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Loading state before spec is ready */}
        {isLoading && !hasSpec && (
          <div className="mt-8 max-w-2xl mx-auto space-y-3">
            <div className="text-sm text-[rgb(var(--muted))] text-center animate-pulse">Building your dashboard…</div>
            {stream.events.length > 0 && (
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 space-y-1 text-xs font-mono max-h-48 overflow-y-auto" role="log" aria-live="polite">
                {stream.events.slice(-10).map((e, i) => (
                  <div key={i} className="text-[rgb(var(--muted))]">
                    {e.type === 'tool_call' ? `→ ${e.toolName}` : e.type === 'tool_result' ? `← ${e.success ? '✓' : '✗'}` : e.type}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {stream.error && !hasSpec && (
          <div className="mt-8 max-w-2xl mx-auto rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500" role="alert">
            {stream.error}
            <Button variant="ghost" size="sm" className="ml-3" onClick={() => void handleSubmit(prompt)}>
              Retry
            </Button>
          </div>
        )}
      </main>

      <footer className="border-t border-[rgb(var(--border))] px-4 py-3 text-xs text-[rgb(var(--muted))] flex items-center justify-between">
        <span>Built on <a href="https://docs.envio.dev" className="hover:text-[rgb(var(--accent))]" target="_blank" rel="noreferrer">Envio HyperSync</a></span>
        <span>Data is live and re-queried on every view</span>
      </footer>
    </div>
  );
}
