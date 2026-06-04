/** The eight providers the gateway can be configured to use. */
export type ProviderId =
  | "groq"
  | "gemini"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "mistral"
  | "google_ai";

/** Pipeline stages that request generations (used as routing keys). */
export type StageName = "intent" | "schema" | "appspec" | "repair";

/** A normalized request the gateway hands to any adapter. */
export interface GatewayRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider to emit JSON when it supports a JSON/structured mode. */
  jsonMode?: boolean;
}

/** Raw result from a provider adapter (before cost is computed). */
export interface RawCompletion {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

/** What a provider adapter needs to make one call. */
export interface AdapterArgs {
  providerModel: string;
  apiKey: string;
  req: GatewayRequest;
  fetchImpl: typeof fetch;
}

/** A provider adapter: one function per API shape. */
export type ProviderAdapter = (args: AdapterArgs) => Promise<RawCompletion>;

/**
 * The capability stages depend on: turn a request into a completion. The
 * concrete `Gateway` class satisfies this structurally; tests inject a fake.
 */
export interface LlmGateway {
  generate(stage: StageName, req: GatewayRequest): Promise<GatewayResponse>;
}

/** Final gateway result, including cost + telemetry. */
export interface GatewayResponse {
  text: string;
  modelId: string;
  provider: ProviderId;
  providerModel: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  /** True when this came from the OpenRouter universal fallback. */
  viaFallback: boolean;
}

// --- error taxonomy ---------------------------------------------------------
// The gateway distinguishes RETRYABLE failures (429 / 5xx -> try OpenRouter)
// from non-retryable ones (4xx, config). Adapters throw the right subtype.

export class RateLimitError extends Error {
  readonly retryable = true;
}
export class ProviderServerError extends Error {
  readonly retryable = true;
}
export class ProviderRequestError extends Error {
  readonly retryable = false;
}
/** Thrown when every provider in the chain has failed. */
export class GatewayError extends Error {
  readonly retryable = false;
}

export function isRetryable(err: unknown): boolean {
  return (
    err instanceof RateLimitError || err instanceof ProviderServerError
  );
}
