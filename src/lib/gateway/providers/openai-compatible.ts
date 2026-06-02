import type { ProviderAdapter, RawCompletion } from "@/lib/gateway/types";
import { estimateTokens, throwForStatus, safeText } from "@/lib/gateway/providers/util";

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Adapter for any OpenAI-compatible chat-completions API. One function serves
 * Groq, OpenRouter, OpenAI, DeepSeek, and Mistral — they differ only by base URL
 * (and a couple of optional headers).
 */
export function openAICompatible(
  baseUrl: string,
  extraHeaders: Record<string, string> = {},
): ProviderAdapter {
  return async ({ providerModel, apiKey, req, fetchImpl }): Promise<RawCompletion> => {
    const body: Record<string, unknown> = {
      model: providerModel,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature ?? 0,
    };
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.jsonMode) body.response_format = { type: "json_object" };

    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throwForStatus(res.status, await safeText(res));

    const data = (await res.json()) as OpenAIResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
    const tokensIn = data.usage?.prompt_tokens ?? estimateTokens(req.system + req.user);
    const tokensOut = data.usage?.completion_tokens ?? estimateTokens(text);
    return { text, tokensIn, tokensOut };
  };
}
