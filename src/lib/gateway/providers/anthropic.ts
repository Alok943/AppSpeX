import type { ProviderAdapter, RawCompletion } from "@/lib/gateway/types";
import { estimateTokens, throwForStatus, safeText } from "@/lib/gateway/providers/util";

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Adapter for Anthropic's Messages API. */
export const anthropicAdapter: ProviderAdapter = async ({
  providerModel,
  apiKey,
  req,
  fetchImpl,
}): Promise<RawCompletion> => {
  const body: Record<string, unknown> = {
    model: providerModel,
    system: req.system,
    // Anthropic requires max_tokens; default generously.
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0,
    messages: [{ role: "user", content: req.user }],
  };

  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throwForStatus(res.status, await safeText(res));

  const data = (await res.json()) as AnthropicResponse;
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  const tokensIn = data.usage?.input_tokens ?? estimateTokens(req.system + req.user);
  const tokensOut = data.usage?.output_tokens ?? estimateTokens(text);
  return { text, tokensIn, tokensOut };
};
