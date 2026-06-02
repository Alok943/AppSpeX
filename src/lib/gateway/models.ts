import type { ProviderId, ProviderAdapter } from "@/lib/gateway/types";
import type { Env } from "@/lib/env";
import { openAICompatible } from "@/lib/gateway/providers/openai-compatible";
import { geminiAdapter } from "@/lib/gateway/providers/gemini";
import { anthropicAdapter } from "@/lib/gateway/providers/anthropic";

export interface ProviderConfig {
  adapter: ProviderAdapter;
  envKey: keyof Env;
}

/** All eight providers are configured here (the gateway supports all of them). */
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  groq: { adapter: openAICompatible("https://api.groq.com/openai/v1"), envKey: "GROQ_API_KEY" },
  openrouter: {
    adapter: openAICompatible("https://openrouter.ai/api/v1", {
      "HTTP-Referer": "https://oneatlas.dev",
      "X-Title": "OneAtlas",
    }),
    envKey: "OPENROUTER_API_KEY",
  },
  gemini: { adapter: geminiAdapter, envKey: "GEMINI_API_KEY" },
  google_ai: { adapter: geminiAdapter, envKey: "GOOGLE_AI_API_KEY" },
  openai: { adapter: openAICompatible("https://api.openai.com/v1"), envKey: "OPENAI_API_KEY" },
  deepseek: { adapter: openAICompatible("https://api.deepseek.com/v1"), envKey: "DEEPSEEK_API_KEY" },
  mistral: { adapter: openAICompatible("https://api.mistral.ai/v1"), envKey: "MISTRAL_API_KEY" },
  anthropic: { adapter: anthropicAdapter, envKey: "ANTHROPIC_API_KEY" },
};

export type ModelId = string;

export interface ModelDef {
  provider: ProviderId;
  providerModel: string;
  /** Equivalent model on OpenRouter, used for the universal fallback. */
  openRouterModel?: string;
}

/** Logical model ids the routing config references. */
export const MODELS: Record<string, ModelDef> = {
  "groq-llama-8b": {
    provider: "groq",
    providerModel: "llama-3.1-8b-instant",
    openRouterModel: "meta-llama/llama-3.1-8b-instruct",
  },
  "groq-llama-70b": {
    provider: "groq",
    providerModel: "llama-3.3-70b-versatile",
    openRouterModel: "meta-llama/llama-3.3-70b-instruct",
  },
  "gemini-flash": {
    provider: "gemini",
    providerModel: "gemini-1.5-flash",
    openRouterModel: "google/gemini-flash-1.5",
  },
  "gemini-pro": {
    provider: "gemini",
    providerModel: "gemini-1.5-pro",
    openRouterModel: "google/gemini-pro-1.5",
  },
  "openrouter-llama-70b": {
    provider: "openrouter",
    providerModel: "meta-llama/llama-3.3-70b-instruct",
  },
};

export interface CostRate {
  inputPer1M: number;
  outputPer1M: number;
}

/** Per-model USD rates per 1M tokens. Keyed by the provider's model string. */
export const COST_TABLE: Record<string, CostRate> = {
  "llama-3.1-8b-instant": { inputPer1M: 0.05, outputPer1M: 0.08 },
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "gemini-1.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
  "meta-llama/llama-3.1-8b-instruct": { inputPer1M: 0.05, outputPer1M: 0.05 },
  "meta-llama/llama-3.3-70b-instruct": { inputPer1M: 0.12, outputPer1M: 0.3 },
  "google/gemini-flash-1.5": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "google/gemini-pro-1.5": { inputPer1M: 1.25, outputPer1M: 5.0 },
};

/** USD cost for a generation. Unknown models cost 0 (logged as such). */
export function computeCost(providerModel: string, tokensIn: number, tokensOut: number): number {
  const rate = COST_TABLE[providerModel];
  if (!rate) return 0;
  return (tokensIn / 1_000_000) * rate.inputPer1M + (tokensOut / 1_000_000) * rate.outputPer1M;
}
