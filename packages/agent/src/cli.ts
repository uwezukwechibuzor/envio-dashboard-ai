import '@envio-dashboard-ai/metrics';
import { runAgent } from './agent.js';
import type { ProgressEvent } from './types.js';

function formatEvent(event: ProgressEvent): string {
  switch (event.type) {
    case 'tool_call':
      return `[turn ${event.turn}] → ${event.toolName}(${JSON.stringify(event.args)})`;
    case 'tool_result':
      return `           ← ${event.toolCallId} ${event.success ? 'OK' : 'ERROR'}`;
    case 'validating_spec':
      return '[validating spec...]';
    case 'spec_invalid':
      return `[spec invalid, retrying (attempt ${event.attempt}): ${event.error}]`;
    case 'done':
      return `[done] spec: "${event.spec.title}", ${event.spec.widgets.length} widgets`;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm agent "<prompt>"');
    process.exit(1);
  }

  const prompt = args.join(' ');

  console.info(`Running agent: ${prompt}\n`);

  try {
    const result = await runAgent(prompt, {
      onProgress: (event) => {
        console.info(formatEvent(event));
      },
    });

    console.info('\n--- DashboardSpec ---');
    console.info(JSON.stringify(result.spec, null, 2));
    console.info('\n--- Summary ---');
    console.info(result.summary);
    console.info('\n--- Token Usage ---');
    console.info(
      `Input: ${result.usage.inputTokens.toLocaleString()} | Output: ${result.usage.outputTokens.toLocaleString()} | Cache read: ${result.usage.cacheReadTokens.toLocaleString()} | Cache write: ${result.usage.cacheWriteTokens.toLocaleString()}`,
    );
  } catch (err) {
    console.error('\n--- Agent Error ---');
    if (err instanceof Error) {
      console.error(`${err.name}: ${err.message}`);
    } else {
      console.error(String(err));
    }
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
