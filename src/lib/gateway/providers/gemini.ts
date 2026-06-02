import type { ProviderAdapter, RawCompletion } from "@/lib/gateway/types";
import { estimateTokens, throwForStatus, safeText } from "@/lib/gateway/providers/util";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Adapter for Google's Gemini generateContent API (also used for google_ai). */
export const geminiAdapter: ProviderAdapter = async ({
  providerModel,
  apiKey,
  req,
  fetchImpl,
}): Promise<RawCompletion> => {
  const generationConfig: Record<string, unknown> = {
    temperature: req.temperature ?? 0,
  };
  if (req.maxTokens !== undefined) generationConfig.maxOutputTokens = req.maxTokens;
  if (req.jsonMode) generationConfig.responseMimeType = "application/json";

  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig,
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${providerModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throwForStatus(res.status, await safeText(res));

  const data = (await res.json()) as GeminiResponse;
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  const tokensIn = data.usageMetadata?.promptTokenCount ?? estimateTokens(req.system + req.user);
  const tokensOut = data.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);
  return { text, tokensIn, tokensOut };
};
