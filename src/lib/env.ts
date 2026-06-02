import { z } from "zod";

/**
 * Typed access to provider API keys.
 *
 * The gateway must *support* all eight providers as configurable options, so we
 * read all eight here. None are required at load time — the app boots with only
 * the keys you actually have, and the gateway skips providers whose key is
 * missing. Secrets live only in `.env` (git-ignored); never hardcode them.
 */
const EnvSchema = z.object({
  // Providers we fully wire for this build.
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  // Supported via config but not the default routing targets.
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

/** True when a provider's API key is present in the environment. */
export function hasKey(key: keyof Env): boolean {
  return typeof env[key] === "string" && env[key]!.length > 0;
}
