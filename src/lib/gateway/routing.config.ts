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
 *  - intent  -> fast/cheap model (Groq Llama 8b)
 *  - schema  -> capable model (Gemini 1.5 Pro)
 *  - appspec -> same tier as schema
 *  - repair  -> fast model for narrow field re-prompts
 *
 * On a 429/5xx from the primary, the gateway retries the OpenRouter equivalent
 * (universal fallback) before dropping to the stage's `fallback` model.
 */
export const ROUTING: Record<StageName, RouteConfig> = {
  intent: { primary: "groq-llama-8b", fallback: "gemini-flash" },
  schema: { primary: "gemini-pro", fallback: "groq-llama-70b" },
  appspec: { primary: "gemini-pro", fallback: "groq-llama-70b" },
  repair: { primary: "groq-llama-8b", fallback: "gemini-flash" },
};
