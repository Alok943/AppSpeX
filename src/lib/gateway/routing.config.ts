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
 *  - intent  -> cheapest fast model (Groq Llama 3.1 8B)
 *  - schema  -> most capable cheap model (Groq gpt-oss-120b)
 *  - appspec -> most capable cheap model (Groq gpt-oss-120b; hardest stage)
 *  - repair  -> fast model for narrow field re-prompts (Groq Llama 3.1 8B)
 *
 * Gemini 2.5 Flash is the free-tier fallback. All models here are near-$0.
 *
 * On a 429/5xx from the primary, the gateway retries the OpenRouter equivalent
 * (universal fallback) before dropping to the stage's `fallback` model.
 */
export const ROUTING: Record<StageName, RouteConfig> = {
  intent: { primary: "groq-llama-8b", fallback: "gemini-flash" },
  schema: { primary: "groq-gpt-oss-120b", fallback: "gemini-flash" },
  appspec: { primary: "groq-gpt-oss-120b", fallback: "gemini-flash" },
  repair: { primary: "groq-llama-8b", fallback: "gemini-flash" },
};
