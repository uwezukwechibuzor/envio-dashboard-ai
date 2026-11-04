'use client';
import { useState } from 'react';
import type { DashboardSpec } from '@envio-dashboard-ai/core';
import { getUpsellsFromSpec } from '@/lib/upsell.js';
import { Button } from '@/components/ui/button.js';

type Props = {
  spec: DashboardSpec;
  agentMs?: number | null;
};

export function EnvioUpsell({ spec, agentMs }: Props) {
  const [open, setOpen] = useState(false);

  const queries = spec.widgets.map((w) => ({ args: w.query.args }));
  const upsells = getUpsellsFromSpec(queries, {});

  if (upsells.length === 0) return null;
  const upsell = upsells[0]!;

  return (
    <div className="rounded-xl border border-[rgb(var(--accent))]/30 bg-orange-500/5 overflow-hidden">
      {/* Header strip */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-orange-500/5 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">⚡</span>
          <div>
            <div className="text-sm font-semibold text-[rgb(var(--accent))]">Make this your own indexer</div>
            <div className="text-xs text-[rgb(var(--muted))]">
              Deploy on Envio Cloud and own your data pipeline
              {agentMs != null && ` · queried in ${(agentMs / 1000).toFixed(1)}s`}
            </div>
          </div>
        </div>
        <span className="text-[rgb(var(--muted))] text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="px-4 pb-4 border-t border-[rgb(var(--accent))]/20 mt-0 pt-4 space-y-4">
          <p className="text-sm text-[rgb(var(--muted))]">
            This dashboard was built using{' '}
            <a href="https://docs.envio.dev/docs/HyperSync/overview" target="_blank" rel="noreferrer" className="text-[rgb(var(--accent))] hover:underline">
              Envio HyperSync
            </a>
            {' '}— a blazing-fast on-chain data layer. Deploy your own {upsell.protocolName} indexer on{' '}
            <a href="https://envio.dev" target="_blank" rel="noreferrer" className="text-[rgb(var(--accent))] hover:underline">
              Envio Cloud
            </a>{' '}
            and stream exactly the events you need.
          </p>

          {/* Init command */}
          <div>
            <div className="text-xs text-[rgb(var(--muted))] mb-1 font-medium uppercase tracking-wide">1. Scaffold your indexer</div>
            <div className="relative group">
              <pre className="bg-[rgb(var(--card))] border border-[rgb(var(--border))] rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre">
                {upsell.initCommand}
              </pre>
              <button
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded bg-[rgb(var(--border))] hover:bg-[rgb(var(--muted))/20] transition-all"
                onClick={() => void navigator.clipboard.writeText(upsell.initCommand)}
                aria-label="Copy command"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-3">
            {upsell.repoUrl && (
              <a
                href={upsell.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[rgb(var(--accent))] hover:underline flex items-center gap-1"
              >
                ↗ Open-source indexer on GitHub
              </a>
            )}
            <a
              href={upsell.deployDocsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[rgb(var(--accent))] hover:underline flex items-center gap-1"
            >
              ↗ Envio Cloud deploy docs
            </a>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.open('https://envio.dev', '_blank')}
            >
              Get started on Envio Cloud →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
