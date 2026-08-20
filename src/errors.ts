/**
 * Errors are written for the model that will read them, not for a log file.
 * Each one names what went wrong and, where there is one, the concrete action
 * that fixes it. Stack traces never reach the transcript -- they cost context
 * and tell the caller nothing it can act on.
 */

export type ToolErrorCode =
  /** A required API key is absent from the environment. */
  | 'missing_credentials'
  /** An optional source was asked for but is not configured. */
  | 'source_disabled'
  /** The upstream free-tier request budget for today is spent. */
  | 'quota_exhausted'
  /** The plant, species, or location could not be resolved. */
  | 'not_found'
  /** The caller's arguments cannot produce an answer. */
  | 'invalid_input'
  /** The upstream API failed or returned something unusable. */
  | 'upstream_error';

export interface ToolErrorOptions {
  /** The concrete action that resolves this error. */
  remedy?: string;
  cause?: unknown;
}

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly remedy: string | undefined;

  constructor(code: ToolErrorCode, message: string, options: ToolErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ToolError';
    this.code = code;
    this.remedy = options.remedy;
  }

  /** The text a model should see: what happened, then how to fix it. */
  render(): string {
    return this.remedy === undefined ? this.message : `${this.message}\nRemedy: ${this.remedy}`;
  }
}

/** Narrow MCP tool result shape -- structurally compatible with the SDK's CallToolResult. */
export interface ToolResult {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

/**
 * Converts anything thrown inside a tool into a result the model can act on.
 * Unexpected errors surface their message but never their stack.
 */
export function toToolResult(error: unknown): ToolResult {
  let text: string;

  if (error instanceof ToolError) {
    text = error.render();
  } else if (error instanceof Error) {
    text = `plant-intel hit an unexpected failure: ${error.message}`;
  } else {
    text = `plant-intel hit an unexpected failure: ${String(error)}`;
  }

  return { isError: true, content: [{ type: 'text', text }] };
}

/** Wraps a tool handler so every failure path returns a model-readable result. */
export async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error: unknown) {
    return toToolResult(error);
  }
}
