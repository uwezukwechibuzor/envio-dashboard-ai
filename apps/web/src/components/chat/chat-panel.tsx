'use client';
import { useState, useRef, useEffect } from 'react';
import type { DashboardSpec } from '@envio-dashboard-ai/core';
import { Button } from '@/components/ui/button.js';
import { AgentProgress } from './agent-progress.js';
import type { AgentStreamState } from '@/hooks/use-agent-stream.js';

type HistoryEntry = { role: 'user' | 'assistant'; content: string };

type Props = {
  currentSpec: DashboardSpec | null;
  streamState: AgentStreamState;
  onSubmit: (prompt: string, history: HistoryEntry[], previousSpec: DashboardSpec | null) => void;
};

export function ChatPanel({ currentSpec, streamState, onSubmit }: Props) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (streamState.spec) {
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: streamState.summary ?? '' },
      ]);
    }
  }, [streamState.spec, streamState.summary]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || streamState.isStreaming) return;

    setHistory((prev) => [...prev, { role: 'user', content: prompt }]);
    setInput('');
    onSubmit(prompt, history, currentSpec);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Progress log */}
      <AgentProgress events={streamState.events} isStreaming={streamState.isStreaming} />

      {/* Error */}
      {streamState.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500" role="alert">
          {streamState.error}
        </div>
      )}

      {/* Chat history */}
      {history.length > 0 && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 space-y-2 max-h-48 overflow-y-auto">
          {history.map((h, i) => (
            <div key={i} className={`text-sm ${h.role === 'user' ? 'text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))]'}`}>
              <span className="font-medium mr-2">{h.role === 'user' ? 'You:' : 'AI:'}</span>
              {h.content.slice(0, 200)}{h.content.length > 200 ? '…' : ''}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          ref={textRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
          }}
          placeholder={currentSpec ? 'Refine: "add Base", "weekly", "remove users"…' : 'Ask a question…'}
          rows={2}
          disabled={streamState.isStreaming}
          className="flex-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-3 py-2 text-sm resize-none focus:outline-none focus:border-[rgb(var(--accent))] disabled:opacity-50"
          aria-label="Refine dashboard prompt"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={streamState.isStreaming}
          disabled={!input.trim()}
          aria-label="Send message"
        >
          Send
        </Button>
      </form>
    </div>
  );
}
