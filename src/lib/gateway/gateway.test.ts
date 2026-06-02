import { describe, it, expect } from "vitest";
import { Gateway, GatewayError, ROUTING } from "@/lib/gateway";

function openAISuccess(content: string, pin = 10, pout = 20): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: pin, completion_tokens: pout },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function geminiSuccess(content: string, pin = 10, pout = 20): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: content }] } }],
      usageMetadata: { promptTokenCount: pin, candidatesTokenCount: pout },
    }),
    { status: 200 },
  );
}

const errorResp = (status: number): Response => new Response("error", { status });

const req = { system: "s", user: "u" };
const keysAlways = () => "test-key";

function makeGateway(
  fetchMock: (url: string) => Promise<Response>,
  getApiKey: (p: string) => string | undefined = keysAlways,
) {
  return new Gateway({
    getApiKey: getApiKey as () => string | undefined,
    fetchImpl: ((url: string | URL | Request) =>
      fetchMock(String(url))) as unknown as typeof fetch,
    routing: ROUTING,
  });
}

describe("Gateway", () => {
  it("calls the primary model and computes cost + telemetry", async () => {
    const gw = makeGateway(async () => openAISuccess("hello"));
    const r = await gw.generate("intent", req);

    expect(r.text).toBe("hello");
    expect(r.provider).toBe("groq");
    expect(r.viaFallback).toBe(false);
    expect(r.tokensIn).toBe(10);
    expect(r.tokensOut).toBe(20);
    // llama-3.1-8b-instant: 0.05 in / 0.08 out per 1M
    expect(r.costUsd).toBeCloseTo((10 / 1e6) * 0.05 + (20 / 1e6) * 0.08, 12);
  });

  it("falls back to OpenRouter on a 429 from the primary", async () => {
    const gw = makeGateway(async (url) => {
      if (url.includes("api.groq.com")) return errorResp(429);
      if (url.includes("openrouter.ai")) return openAISuccess("via-openrouter");
      return errorResp(500);
    });
    const r = await gw.generate("intent", req);
    expect(r.provider).toBe("openrouter");
    expect(r.viaFallback).toBe(true);
    expect(r.text).toBe("via-openrouter");
  });

  it("skips OpenRouter on a non-retryable 4xx and uses the stage fallback", async () => {
    const seen: string[] = [];
    const gw = makeGateway(async (url) => {
      seen.push(url);
      if (url.includes("api.groq.com")) return errorResp(400); // non-retryable
      if (url.includes("generativelanguage")) return geminiSuccess("via-gemini");
      return errorResp(500);
    });
    const r = await gw.generate("intent", req);
    expect(r.provider).toBe("gemini"); // stage fallback = gemini-flash
    expect(seen.some((u) => u.includes("openrouter.ai"))).toBe(false);
  });

  it("skips OpenRouter fallback when no OpenRouter key is configured", async () => {
    const getApiKey = (p: string) => (p === "openrouter" ? undefined : "test-key");
    const gw = makeGateway(async (url) => {
      if (url.includes("api.groq.com")) return errorResp(429);
      if (url.includes("generativelanguage")) return geminiSuccess("via-gemini");
      return errorResp(500);
    }, getApiKey);
    const r = await gw.generate("intent", req);
    expect(r.provider).toBe("gemini");
  });

  it("throws GatewayError when every provider fails", async () => {
    const gw = makeGateway(async () => errorResp(500));
    await expect(gw.generate("intent", req)).rejects.toBeInstanceOf(GatewayError);
  });
});
