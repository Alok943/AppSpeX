import type { StageName } from "@/lib/gateway/types";
import type { ModelId } from "@/lib/gateway/models";

export interface RouteConfig {
  primary: ModelId;
  fallback: ModelId;
}

/**
 * THE routing config. This is the single place pipeline stages are mapped to
 * models — stage code never names a model. Edit here to re-route.
 *
 * Routing by stage WORKLOAD: light stages stay on Groq (fast + cheap, no
 * per-minute output-token timeout); output-heavy stages go to Gemini 3.1 Flash
 * Lite, which has the throughput headroom Groq lacks for large JSON.
 *
 *  - intent  -> Groq Llama 3.1 8B       (tiny output)
 *  - repair  -> Groq Llama 3.1 8B       (single-field re-prompts)
 *  - schema  -> Gemini 3.1 Flash Lite   (large JSON)
 *  - appspec -> Gemini 3.1 Flash Lite   (largest JSON)
 *
 * Fallbacks are cross-provider for resilience.
 *
 * On a 429/5xx from the primary, the gateway retries the OpenRouter equivalent
 * (universal fallback) before dropping to the stage's `fallback` model.
 */
export const ROUTING: Record<StageName, RouteConfig> = {
  // Light output → Groq (fast, cheap, no TPM timeout). Heavy output → Gemini.
  intent: { primary: "groq-llama-8b", fallback: "gemini-flash-lite" },
  schema: { primary: "gemini-flash-lite", fallback: "groq-llama-70b" },
  appspec: { primary: "gemini-flash-lite", fallback: "groq-llama-70b" },
  repair: { primary: "groq-llama-8b", fallback: "gemini-flash-lite" },
};
