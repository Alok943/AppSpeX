import type {
  StageName,
  GatewayRequest,
  GatewayResponse,
  ProviderId,
} from "@/lib/gateway/types";
import { GatewayError, ProviderRequestError, isRetryable } from "@/lib/gateway/types";
import { MODELS, PROVIDERS, computeCost, type ModelDef } from "@/lib/gateway/models";
import { ROUTING, type RouteConfig } from "@/lib/gateway/routing.config";
import { env } from "@/lib/env";

export interface GatewayDeps {
  /** Resolve a provider's API key. Default reads from env. */
  getApiKey: (provider: ProviderId) => string | undefined;
  /** HTTP implementation. Default is global fetch; tests inject a fake. */
  fetchImpl: typeof fetch;
  /** Stage -> model routing. Default is ROUTING. */
  routing: Record<StageName, RouteConfig>;
}

function defaultGetApiKey(provider: ProviderId): string | undefined {
  return env[PROVIDERS[provider].envKey];
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Provider-agnostic AI gateway. Stages call `generate(stage, req)` and never
 * name a model. Routing, fallback, cost, and telemetry are handled here.
 */
export class Gateway {
  private readonly deps: GatewayDeps;

  constructor(deps: Partial<GatewayDeps> = {}) {
    this.deps = {
      getApiKey: deps.getApiKey ?? defaultGetApiKey,
      fetchImpl: deps.fetchImpl ?? globalThis.fetch.bind(globalThis),
      routing: deps.routing ?? ROUTING,
    };
  }

  async generate(stage: StageName, req: GatewayRequest): Promise<GatewayResponse> {
    const route = this.deps.routing[stage];
    const errors: string[] = [];

    // 1. Primary model.
    const primaryModel = this.resolveModel(route.primary);
    try {
      return await this.callModel(primaryModel, route.primary, req, false);
    } catch (e) {
      errors.push(`primary ${route.primary}: ${errMessage(e)}`);

      // 2. OpenRouter universal fallback — only on a retryable (429/5xx) failure.
      if (isRetryable(e) && primaryModel.openRouterModel && this.deps.getApiKey("openrouter")) {
        try {
          const orModel: ModelDef = {
            provider: "openrouter",
            providerModel: primaryModel.openRouterModel,
          };
          return await this.callModel(orModel, `openrouter:${primaryModel.openRouterModel}`, req, true);
        } catch (e2) {
          errors.push(`openrouter-fallback: ${errMessage(e2)}`);
        }
      }
    }

    // 3. Stage fallback model.
    try {
      const fallbackModel = this.resolveModel(route.fallback);
      return await this.callModel(fallbackModel, route.fallback, req, true);
    } catch (e) {
      errors.push(`fallback ${route.fallback}: ${errMessage(e)}`);
    }

    throw new GatewayError(`All providers failed for stage "${stage}": ${errors.join(" | ")}`);
  }

  private resolveModel(modelId: string): ModelDef {
    const model = MODELS[modelId];
    if (!model) throw new GatewayError(`unknown model id "${modelId}"`);
    return model;
  }

  private async callModel(
    model: ModelDef,
    modelId: string,
    req: GatewayRequest,
    viaFallback: boolean,
  ): Promise<GatewayResponse> {
    const apiKey = this.deps.getApiKey(model.provider);
    if (!apiKey) {
      throw new ProviderRequestError(`no API key configured for provider "${model.provider}"`);
    }
    const adapter = PROVIDERS[model.provider].adapter;
    const start = Date.now();
    const raw = await adapter({
      providerModel: model.providerModel,
      apiKey,
      req,
      fetchImpl: this.deps.fetchImpl,
    });
    const latencyMs = Date.now() - start;
    return {
      text: raw.text,
      modelId,
      provider: model.provider,
      providerModel: model.providerModel,
      tokensIn: raw.tokensIn,
      tokensOut: raw.tokensOut,
      costUsd: computeCost(model.providerModel, raw.tokensIn, raw.tokensOut),
      latencyMs,
      viaFallback,
    };
  }
}

/** Shared gateway instance for the app. */
export const gateway = new Gateway();
