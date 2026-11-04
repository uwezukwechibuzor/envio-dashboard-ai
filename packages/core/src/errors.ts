export type ToolError = {
  error: { code: string; message: string; hint?: string };
};

export class EnvioError extends Error {
  readonly code: string;
  readonly hint?: string;

  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.name = 'EnvioError';
    this.code = code;
    this.hint = hint;
  }

  toToolResult(): ToolError {
    return { error: { code: this.code, message: this.message, hint: this.hint } };
  }
}

export class UnsupportedChainError extends EnvioError {
  constructor(chainId: number, protocolId: string) {
    super(
      'UNSUPPORTED_CHAIN',
      `Protocol "${protocolId}" does not support chain ${chainId}`,
      'Check the protocol pack for the list of supported chains.',
    );
  }
}

export class UnknownProtocolError extends EnvioError {
  constructor(id: string) {
    super(
      'UNKNOWN_PROTOCOL',
      `Protocol "${id}" is not registered`,
      'Call resolve_protocol to get a valid protocol ID.',
    );
  }
}

export class UnknownMetricError extends EnvioError {
  constructor(metricId: string, protocolId: string) {
    super(
      'UNKNOWN_METRIC',
      `Metric "${metricId}" is not defined for protocol "${protocolId}"`,
      'Call list_metrics to see available metrics for this protocol.',
    );
  }
}

export class UpstreamError extends EnvioError {
  constructor(message: string, hint?: string) {
    super('UPSTREAM_ERROR', message, hint);
  }
}

export class RateLimitedError extends EnvioError {
  constructor() {
    super(
      'RATE_LIMITED',
      'HyperSync rate limit exceeded',
      'The client retries automatically — reduce concurrency if this persists.',
    );
  }
}

export class ConfigError extends EnvioError {
  constructor(message: string) {
    super('CONFIG_ERROR', message);
  }
}

export function isEnvioError(err: unknown): err is EnvioError {
  return err instanceof EnvioError;
}
