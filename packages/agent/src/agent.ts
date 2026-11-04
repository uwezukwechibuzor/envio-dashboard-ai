import Anthropic from '@anthropic-ai/sdk';
import { DashboardSpecSchema, type DashboardSpec } from '@envio-dashboard-ai/core';
import { buildSystemContent } from './system-prompt.js';
import { TOOL_DEFINITIONS, TOOL_EXECUTORS } from './tools.js';
import { checkLimits, recordTokenUsage } from './limits.js';
import { type AgentOptions, type AgentResult, type TokenUsage, AgentError } from './types.js';

const DEFAULT_MAX_TURNS = 20;

function selectModel(prompt: string, options: AgentOptions): string {
  if (options.model) return options.model;
  const isComplex = /\bcompare\b|\bvs\b|\bversus\b/i.test(prompt);
  return isComplex ? 'claude-opus-4-8' : 'claude-sonnet-4-6';
}

function extractSpecFromText(text: string): { specJson: unknown; summary: string } | null {
  const match = /<dashboard_spec>\s*([\s\S]*?)\s*<\/dashboard_spec>/i.exec(text);
  if (!match?.[1]) return null;

  let specJson: unknown;
  try {
    specJson = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const afterTag = text.slice(text.indexOf('</dashboard_spec>') + '</dashboard_spec>'.length);
  const summary = afterTag.trim();
  return { specJson, summary };
}

function validateProvenance(spec: DashboardSpec, ledger: Map<string, unknown>): void {
  const unknownIds: string[] = [];
  for (const widget of spec.widgets) {
    if (!ledger.has(widget.query.toolCallId)) unknownIds.push(widget.query.toolCallId);
    for (const cw of widget.compareWith ?? []) {
      if (!ledger.has(cw.toolCallId)) unknownIds.push(cw.toolCallId);
    }
  }
  if (unknownIds.length > 0) {
    throw new AgentError(
      'INVALID_PROVENANCE',
      `Spec references tool call IDs that were never made: ${unknownIds.join(', ')}. All widget data must come from actual tool calls.`,
    );
  }
}

function accumulateUsage(acc: TokenUsage, raw: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: acc.inputTokens + raw.input_tokens,
    outputTokens: acc.outputTokens + raw.output_tokens,
    cacheReadTokens: acc.cacheReadTokens + ((raw as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0),
    cacheWriteTokens: acc.cacheWriteTokens + ((raw as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0),
  };
}

export async function runAgent(prompt: string, options: AgentOptions = {}): Promise<AgentResult> {
  const userId = options.userId ?? 'anonymous';
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const model = selectModel(prompt, options);

  checkLimits(userId);

  const client = new Anthropic({
    apiKey: options.apiKey ?? process.env['ANTHROPIC_API_KEY'],
  });

  const systemContent = buildSystemContent({ previousSpec: options.previousSpec });

  const messages: Anthropic.MessageParam[] = [
    ...(options.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt },
  ];

  const toolCallLedger = new Map<string, unknown>();
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let turns = 0;
  let specValidationAttempts = 0;

  while (turns < maxTurns) {
    turns++;

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemContent as Anthropic.TextBlockParam[],
      tools: TOOL_DEFINITIONS,
      messages,
      thinking: ({ type: 'adaptive' } as unknown) as Anthropic.ThinkingConfigParam,
    });

    usage = accumulateUsage(usage, response.usage);
    recordTokenUsage(userId, response.usage.input_tokens + response.usage.output_tokens);

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textContent = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const extracted = extractSpecFromText(textContent);
      if (!extracted) {
        throw new AgentError(
          'NO_SPEC_PRODUCED',
          'The agent did not produce a <dashboard_spec> block. The protocol may be unsupported or the request could not be fulfilled.',
        );
      }

      options.onProgress?.({ type: 'validating_spec' });

      const parseResult = DashboardSpecSchema.safeParse(extracted.specJson);
      if (!parseResult.success) {
        if (specValidationAttempts >= 1) {
          throw new AgentError(
            'SPEC_VALIDATION_FAILED',
            `DashboardSpec validation failed after retry: ${parseResult.error.message}`,
          );
        }
        specValidationAttempts++;
        const errorMsg = parseResult.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        options.onProgress?.({ type: 'spec_invalid', error: errorMsg, attempt: specValidationAttempts });
        messages.push({
          role: 'user',
          content: `The DashboardSpec you produced is invalid. Fix these issues and output a corrected spec:\n${errorMsg}`,
        });
        continue;
      }

      validateProvenance(parseResult.data, toolCallLedger);

      options.onProgress?.({ type: 'done', spec: parseResult.data, summary: extracted.summary });
      return { spec: parseResult.data, summary: extracted.summary, usage };
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const args = block.input as Record<string, unknown>;
          options.onProgress?.({
            type: 'tool_call',
            turn: turns,
            toolName: block.name,
            toolCallId: block.id,
            args,
          });

          const executor = TOOL_EXECUTORS.get(block.name);
          let result: { content: string; isError: boolean };
          if (!executor) {
            result = {
              content: JSON.stringify({ error: { code: 'UNKNOWN_TOOL', message: `Tool "${block.name}" is not implemented` } }),
              isError: true,
            };
          } else {
            result = await executor(args);
          }

          toolCallLedger.set(block.id, JSON.parse(result.content) as unknown);
          options.onProgress?.({ type: 'tool_result', toolCallId: block.id, success: !result.isError });

          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result.content,
            is_error: result.isError,
          };
        }),
      );

      messages.push({ role: 'user', content: toolResults });
    }
  }

  throw new AgentError(
    'MAX_TURNS_EXCEEDED',
    `Agent loop exceeded ${maxTurns} turns without producing a DashboardSpec.`,
  );
}
