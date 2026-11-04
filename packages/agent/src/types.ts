import type { DashboardSpec } from '@envio-dashboard-ai/core';

export type ProgressEvent =
  | { type: 'tool_call'; turn: number; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; success: boolean }
  | { type: 'validating_spec' }
  | { type: 'spec_invalid'; error: string; attempt: number }
  | { type: 'done'; spec: DashboardSpec; summary: string };

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AgentOptions = {
  userId?: string;
  maxTurns?: number;
  model?: string;
  apiKey?: string;
  previousSpec?: DashboardSpec;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onProgress?: (event: ProgressEvent) => void;
};

export type AgentResult = {
  spec: DashboardSpec;
  summary: string;
  usage: TokenUsage;
};

export class AgentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
  }
}
