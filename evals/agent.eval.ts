import { describe, it, expect, beforeAll } from 'vitest';
import { runAgent, AgentError } from '../packages/agent/src/index.js';
import type { DashboardSpec } from '@envio-dashboard-ai/core';
import { EVAL_CASES, type EvalCase } from './fixtures.js';

const API_KEY = process.env['ANTHROPIC_API_KEY'];
const SKIP = !API_KEY;

function getProtocolsFromSpec(spec: DashboardSpec): string[] {
  const protocols = new Set<string>();
  for (const widget of spec.widgets) {
    const args = widget.query.args;
    if (typeof args['protocol'] === 'string') protocols.add(args['protocol']);
    for (const cw of widget.compareWith ?? []) {
      if (typeof cw.args['protocol'] === 'string') protocols.add(cw.args['protocol']);
    }
  }
  return Array.from(protocols);
}

function getMetricsFromSpec(spec: DashboardSpec): string[] {
  const metrics = new Set<string>();
  for (const widget of spec.widgets) {
    const args = widget.query.args;
    if (typeof args['metric'] === 'string') metrics.add(args['metric']);
    for (const cw of widget.compareWith ?? []) {
      if (typeof cw.args['metric'] === 'string') metrics.add(cw.args['metric']);
    }
  }
  return Array.from(metrics);
}

function getChainsFromSpec(spec: DashboardSpec): number[] {
  return spec.chains;
}

function getWidgetTypesFromSpec(spec: DashboardSpec): string[] {
  return Array.from(new Set(spec.widgets.map((w) => w.type)));
}

type EvalScore = {
  id: string;
  pass: boolean;
  score: number;
  reasons: string[];
};

async function scoreEval(c: EvalCase): Promise<EvalScore> {
  const { expected } = c;

  if (expected.expectError) {
    try {
      await runAgent(c.prompt, { maxTurns: 20 });
      return { id: c.id, pass: false, score: 0, reasons: ['Expected error but agent succeeded'] };
    } catch (err) {
      if (err instanceof AgentError) {
        return { id: c.id, pass: true, score: 100, reasons: [`Correctly failed: ${err.code}`] };
      }
      return { id: c.id, pass: true, score: 100, reasons: [`Correctly failed: ${String(err)}`] };
    }
  }

  let score = 0;
  const reasons: string[] = [];

  let spec: DashboardSpec;
  try {
    const result = await runAgent(c.prompt, { maxTurns: 20 });
    spec = result.spec;
  } catch (err) {
    return { id: c.id, pass: false, score: 0, reasons: [`Agent error: ${err instanceof Error ? err.message : String(err)}`] };
  }

  // Protocol check (40 pts — required for DEX/lending cases)
  if (expected.protocols && expected.protocols.length > 0) {
    const specProtocols = getProtocolsFromSpec(spec);
    const matched = expected.protocols.filter((p) => specProtocols.includes(p));
    const pct = matched.length / expected.protocols.length;
    const pts = Math.round(pct * 40);
    score += pts;
    reasons.push(`protocols ${matched.length}/${expected.protocols.length} (+${pts})`);
  } else {
    score += 40;
    reasons.push('protocols: n/a (+40)');
  }

  // Metric check (30 pts)
  if (expected.metrics && expected.metrics.length > 0) {
    const specMetrics = getMetricsFromSpec(spec);
    const matched = expected.metrics.filter((m) => specMetrics.includes(m));
    const pct = matched.length / expected.metrics.length;
    const pts = Math.round(pct * 30);
    score += pts;
    reasons.push(`metrics ${matched.length}/${expected.metrics.length} (+${pts})`);
  } else {
    score += 30;
    reasons.push('metrics: n/a (+30)');
  }

  // Chain check (20 pts — at least one chain must match)
  if (expected.chains && expected.chains.length > 0) {
    const specChains = getChainsFromSpec(spec);
    const hasMatch = expected.chains.some((c) => specChains.includes(c));
    const pts = hasMatch ? 20 : 0;
    score += pts;
    reasons.push(`chains ${hasMatch ? 'matched' : 'no match'} (+${pts})`);
  } else {
    score += 20;
    reasons.push('chains: n/a (+20)');
  }

  // Widget type check (5 pts bonus)
  if (expected.widgetTypes && expected.widgetTypes.length > 0) {
    const specTypes = getWidgetTypesFromSpec(spec);
    const hasMatch = expected.widgetTypes.some((t) => specTypes.includes(t));
    const pts = hasMatch ? 5 : 0;
    score += pts;
    reasons.push(`widget types ${hasMatch ? 'matched' : 'no match'} (+${pts})`);
  }

  // Min widgets check (5 pts bonus)
  if (expected.minWidgets !== undefined) {
    const hasEnough = spec.widgets.length >= expected.minWidgets;
    const pts = hasEnough ? 5 : 0;
    score += pts;
    reasons.push(`widget count ${spec.widgets.length} >= ${expected.minWidgets} (+${pts})`);
  }

  const pass = score >= 70;
  return { id: c.id, pass, score, reasons };
}

describe.skipIf(SKIP)('agent evals', () => {
  const results: EvalScore[] = [];

  beforeAll(async () => {
    // Import metrics so protocols are registered
    await import('../packages/metrics/src/index.js');
  });

  // Run each eval as an individual test
  for (const c of EVAL_CASES) {
    it(
      `[${c.id}] ${c.prompt.slice(0, 60)}`,
      async () => {
        const score = await scoreEval(c);
        results.push(score);
        expect(score.pass, `Eval ${c.id} failed (score=${score.score}/100): ${score.reasons.join(', ')}`).toBe(true);
      },
    );
  }

  it('overall pass rate >= 90%', () => {
    if (results.length === 0) return; // No evals ran
    const passed = results.filter((r) => r.pass).length;
    const rate = (passed / results.length) * 100;
    console.info(`\nEval results: ${passed}/${results.length} passed (${rate.toFixed(1)}%)`);
    for (const r of results.filter((x) => !x.pass)) {
      console.info(`  FAIL [${r.id}] score=${r.score}: ${r.reasons.join(', ')}`);
    }
    expect(rate).toBeGreaterThanOrEqual(90);
  });
});
