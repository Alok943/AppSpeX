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
      "HTTP-Referer": "https://appspex.dev",
      "X-Title": "AppSpeX",
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
  // Groq — fast + cheap; primaries for every stage. OpenRouter ":free" models
  // are the equivalents used for the universal 429/5xx fallback (also $0).
  "groq-llama-8b": {
    provider: "groq",
    providerModel: "llama-3.1-8b-instant",
    openRouterModel: "nvidia/nemotron-nano-9b-v2:free",
  },
  "groq-gpt-oss-20b": {
    provider: "groq",
    providerModel: "openai/gpt-oss-20b",
    openRouterModel: "nvidia/nemotron-3-super-120b-a12b:free",
  },
  "groq-gpt-oss-120b": {
    provider: "groq",
    providerModel: "openai/gpt-oss-120b",
    openRouterModel: "nvidia/nemotron-3-super-120b-a12b:free",
  },
  // Gemini — free-tier fallback (2.5 Flash has free quota for this key).
  "gemini-flash": {
    provider: "gemini",
    providerModel: "gemini-2.5-flash",
    openRouterModel: "google/gemma-4-31b-it:free",
  },
  "gemini-flash-lite": {
    provider: "gemini",
    providerModel: "gemini-3.1-flash-lite",
    openRouterModel: "google/gemma-4-31b-it:free",
  },
  // Available but not in the default routing.
  "groq-llama-70b": {
    provider: "groq",
    providerModel: "llama-3.3-70b-versatile",
    openRouterModel: "nvidia/nemotron-3-super-120b-a12b:free",
  },
};

export interface CostRate {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Per-model USD rates per 1M tokens, keyed by the provider's model string.
 * Groq prices are exact list prices. Gemini runs on the free tier here ($0).
 * OpenRouter ":free" variants are genuinely $0.
 */
export const COST_TABLE: Record<string, CostRate> = {
  // Groq (exact list prices).
  "llama-3.1-8b-instant": { inputPer1M: 0.05, outputPer1M: 0.08 },
  "openai/gpt-oss-20b": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "openai/gpt-oss-120b": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  // Gemini — free tier for this key.
  "gemini-2.5-flash": { inputPer1M: 0, outputPer1M: 0 },
  "gemini-3.1-flash-lite": { inputPer1M: 0.25, outputPer1M: 1.50 },
  // OpenRouter ":free" variants.
  "nvidia/nemotron-nano-9b-v2:free": { inputPer1M: 0, outputPer1M: 0 },
  "nvidia/nemotron-3-super-120b-a12b:free": { inputPer1M: 0, outputPer1M: 0 },
  "google/gemma-4-31b-it:free": { inputPer1M: 0, outputPer1M: 0 },
};

/** USD cost for a generation. Unknown models cost 0 (logged as such). */
export function computeCost(providerModel: string, tokensIn: number, tokensOut: number): number {
  const rate = COST_TABLE[providerModel];
  if (!rate) return 0;
  return (tokensIn / 1_000_000) * rate.inputPer1M + (tokensOut / 1_000_000) * rate.outputPer1M;
}
