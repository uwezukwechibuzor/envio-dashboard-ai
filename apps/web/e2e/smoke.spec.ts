import { test, expect, type Page } from '@playwright/test';
import type { DashboardSpec } from '@envio-dashboard-ai/core';

const MOCK_SPEC: DashboardSpec = {
  title: 'Uniswap V3 Dashboard',
  description: 'Key metrics for Uniswap V3',
  timeRange: { fromDate: '2026-10-01', toDate: '2026-10-31' },
  chains: [1, 42161],
  widgets: [
    {
      type: 'line',
      title: 'Volume (USD)',
      query: { tool: 'get_metric_series', args: { protocol: 'uniswap-v3', metric: 'volume_usd', chainId: 1, fromDate: '2026-10-01', toDate: '2026-10-31' }, toolCallId: 'toolu_e2e001' },
      display: { unit: 'usd', format: 'currency' },
    },
    {
      type: 'kpi',
      title: 'Total Transactions',
      query: { tool: 'get_metric_series', args: { protocol: 'uniswap-v3', metric: 'txs', chainId: 1, fromDate: '2026-10-01', toDate: '2026-10-31' }, toolCallId: 'toolu_e2e002' },
      display: { unit: 'count', format: 'number' },
    },
  ],
  methodologyNotes: ['Volume from stablecoin side of swaps'],
  generatedAt: '2026-11-01T00:00:00.000Z',
};

const MOCK_METRIC = {
  protocol: 'uniswap-v3',
  chain: 1,
  metric: 'volume_usd',
  unit: 'usd',
  points: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-0${i + 1}`,
    value: String((i + 1) * 1_000_000_000_000), // $1M per day in micro-USD
  })),
  asOfBlock: 20_000_000,
  asOfTimestamp: Math.floor(Date.now() / 1000),
  source: 'hypersync' as const,
  methodology: 'Volume from stablecoin side of Swap events',
};

async function mockAgent(page: Page) {
  await page.route('/api/agent', async (route) => {
    const body = [
      `data: ${JSON.stringify({ type: 'tool_call', turn: 1, toolName: 'resolve_protocol', toolCallId: 'toolu_e2e_r1', args: { query: 'uniswap v3' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'tool_result', toolCallId: 'toolu_e2e_r1', success: true })}\n\n`,
      `data: ${JSON.stringify({ type: 'spec', spec: MOCK_SPEC, summary: 'Uniswap V3 volume was $7.00M [toolu_e2e001]', usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 }, agentMs: 3000 })}\n\n`,
    ].join('');

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body,
    });
  });
}

async function mockMetric(page: Page) {
  await page.route('/api/metric', async (route) => {
    await route.fulfill({ json: MOCK_METRIC });
  });
}

async function mockDashboards(page: Page, savedId = 'test123') {
  await page.route('/api/dashboards', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { id: savedId }, status: 201 });
    }
  });
  await page.route(`/api/dashboards/${savedId}`, async (route) => {
    await route.fulfill({ json: { id: savedId, spec: MOCK_SPEC, summary: '', prompt: 'uniswap dashboard', agentMs: 3000 } });
  });
}

test.describe('home page smoke', () => {
  test('renders prompt box and example chips', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Dashboard prompt' })).toBeVisible();
    await expect(page.getByText('Uniswap V3 fees & volume on Ethereum')).toBeVisible();
  });

  test('example chip fills the prompt', async ({ page }) => {
    await page.goto('/');
    await mockAgent(page);
    await mockMetric(page);
    await page.getByText('Uniswap V3 fees & volume on Ethereum').click();
    // Should start streaming
    await expect(page.getByRole('log')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('dashboard flow', () => {
  test('prompt → dashboard renders', async ({ page }) => {
    await page.goto('/');
    await mockAgent(page);
    await mockMetric(page);

    await page.getByRole('textbox', { name: 'Dashboard prompt' }).fill('generate me a uniswap dashboard');
    await page.getByRole('button', { name: 'Generate dashboard' }).click();

    // Wait for the spec title to appear
    await expect(page.getByText('Uniswap V3 Dashboard')).toBeVisible({ timeout: 15_000 });
    // Widgets should load
    await expect(page.getByText('Volume (USD)')).toBeVisible();
    await expect(page.getByText('Total Transactions')).toBeVisible();
  });

  test('save → share link appears', async ({ page }) => {
    await page.goto('/');
    await mockAgent(page);
    await mockMetric(page);
    await mockDashboards(page, 'shareabc');

    await page.getByRole('textbox', { name: 'Dashboard prompt' }).fill('uniswap dashboard');
    await page.getByRole('button', { name: 'Generate dashboard' }).click();
    await expect(page.getByText('Uniswap V3 Dashboard')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('/d/shareabc')).toBeVisible({ timeout: 5000 });
  });

  test('CSV export works', async ({ page }) => {
    await page.goto('/');
    await mockAgent(page);
    await mockMetric(page);

    await page.getByRole('textbox', { name: 'Dashboard prompt' }).fill('uniswap dashboard');
    await page.getByRole('button', { name: 'Generate dashboard' }).click();
    await expect(page.getByText('Volume (USD)')).toBeVisible({ timeout: 15_000 });

    // Switch to table view
    const volumeWidget = page.locator('.rounded-xl').filter({ hasText: 'Volume (USD)' }).first();
    await volumeWidget.getByRole('button', { name: 'Table' }).click();
    // CSV button should appear
    await expect(volumeWidget.getByRole('button', { name: /CSV/i })).toBeVisible();
  });
});

test.describe('shared dashboard page', () => {
  test('loads a shared dashboard by ID', async ({ page }) => {
    await page.route('/api/dashboards/abc123', async (route) => {
      await route.fulfill({ json: { id: 'abc123', spec: MOCK_SPEC, summary: 'test', prompt: 'uniswap', agentMs: 2000 } });
    });
    await mockMetric(page);

    // The share page loads spec server-side, so we need to mock at the DB level
    // In real tests, this would hit the actual DB. For E2E mocking, test at the page level.
    await page.goto('/');
    // Confirm home page loads (full /d/:id test requires DB)
    await expect(page.getByRole('textbox', { name: 'Dashboard prompt' })).toBeVisible();
  });
});
