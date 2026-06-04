import { describe, it, expect } from "vitest";
import { runPipeline, type PipelineEvent } from "@/lib/pipeline";
import type { GatewayRequest, GatewayResponse, LlmGateway, StageName } from "@/lib/gateway";

// --- fake gateway -----------------------------------------------------------

function resp(text: string): GatewayResponse {
  return {
    text,
    modelId: "fake",
    provider: "groq",
    providerModel: "fake",
    tokensIn: 1,
    tokensOut: 1,
    costUsd: 0,
    latencyMs: 1,
    viaFallback: false,
  };
}

function fakeGateway(fn: (stage: StageName, req: GatewayRequest) => string): LlmGateway {
  return { generate: async (stage, req) => resp(fn(stage, req)) };
}

// --- canned, valid stage outputs --------------------------------------------

const idField = { name: "id", type: "uuid", nullable: false, isRelation: false, isPrimary: true, isUnique: true };
const tenantField = { name: "tenantId", type: "uuid", nullable: false, isRelation: false, isPrimary: false, isUnique: true };

const validIntent = {
  appName: "Real Estate CRM",
  appType: "crm",
  features: ["manage leads"],
  entities: ["Lead", "Deal"],
  integrations_requested: ["whatsapp"],
  assumptions: [],
  clarification_required: false,
  clarification_question: null,
};

const validSchema = {
  entities: [
    {
      name: "Lead",
      tableName: "leads",
      fields: [idField, tenantField],
      relations: [{ type: "hasMany", target: "Deal", foreignKey: "lead_id", onDelete: "cascade" }],
    },
    {
      name: "Deal",
      tableName: "deals",
      fields: [idField, tenantField],
      relations: [{ type: "belongsTo", target: "Lead", foreignKey: "lead_id", onDelete: "cascade" }],
    },
  ],
};

const validAppSpec = {
  pages: [{ name: "Leads", route: "/leads", layout: "list", entity: "Lead", components: ["table"] }],
  apiEndpoints: [
    { path: "/api/leads", method: "GET", handlerDescription: "List leads", entity: "Lead", authRequired: true, rateLimit: false },
  ],
  authRules: { roles: ["admin"], permissions: [{ role: "admin", entity: "Lead", actions: ["read"] }] },
  integrationHooks: [{ integration: "whatsapp", action: "send_template_message" }],
  workflowStubs: [
    {
      name: "Notify on deal closed",
      trigger: { entity: "Deal", event: "status_changed", condition: "status === 'closed'" },
      integration: "whatsapp",
      action: "send_template_message",
      payload: [{ source: "Deal.id", target: "to" }],
    },
  ],
};

describe("runPipeline", () => {
  it("runs all three stages on clean output", async () => {
    const gw = fakeGateway((stage) => {
      if (stage === "intent") return JSON.stringify(validIntent);
      if (stage === "schema") return JSON.stringify(validSchema);
      return JSON.stringify(validAppSpec);
    });
    const events: PipelineEvent[] = [];
    const result = await runPipeline("Build a CRM...", { gateway: gw, onEvent: (e) => events.push(e) });

    expect(result.ok).toBe(true);
    expect(result.intent?.appType).toBe("crm");
    expect(result.dataSchema?.entities).toHaveLength(2);
    expect(result.appSpec?.pages).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("generation_complete");
    expect(events.filter((e) => e.type === "stage_complete")).toHaveLength(3);
  });

  it("halts on clarification_required before Stage 2", async () => {
    const vague = { ...validIntent, clarification_required: true, clarification_question: "What kind of app?" };
    const gw = fakeGateway((stage) => (stage === "intent" ? JSON.stringify(vague) : "{}"));
    const events: PipelineEvent[] = [];
    const result = await runPipeline("an app", { gateway: gw, onEvent: (e) => events.push(e) });

    expect(result.ok).toBe(false);
    expect(result.clarificationRequired).toBe(true);
    expect(result.dataSchema).toBeNull();
    expect(events.some((e) => e.type === "clarification_required")).toBe(true);
  });

  it("recovers fenced JSON via structural repair", async () => {
    const gw = fakeGateway((stage) => {
      if (stage === "intent") return "```json\n" + JSON.stringify(validIntent) + "\n```";
      if (stage === "schema") return JSON.stringify(validSchema);
      return JSON.stringify(validAppSpec);
    });
    const result = await runPipeline("Build a CRM...", { gateway: gw });
    expect(result.ok).toBe(true);
    const intentStage = result.stages.find((s) => s.stage === "intent");
    expect(intentStage?.repairLog.some((l) => l.strategy === "structural")).toBe(true);
  });

  it("fixes a broken schema (missing tenantId + inverse) via consistency repair", async () => {
    const brokenSchema = {
      entities: [
        {
          name: "Lead",
          tableName: "leads",
          fields: [idField], // no tenantId
          relations: [{ type: "hasMany", target: "Deal", foreignKey: "lead_id", onDelete: "cascade" }],
        },
        { name: "Deal", tableName: "deals", fields: [idField], relations: [] }, // no tenantId, no inverse
      ],
    };
    const gw = fakeGateway((stage) => {
      if (stage === "intent") return JSON.stringify(validIntent);
      if (stage === "schema") return JSON.stringify(brokenSchema);
      return JSON.stringify(validAppSpec);
    });
    const result = await runPipeline("Build a CRM...", { gateway: gw });

    expect(result.ok).toBe(true);
    const schemaStage = result.stages.find((s) => s.stage === "schema");
    expect(schemaStage?.repairLog.some((l) => l.detail.includes("added tenantId"))).toBe(true);
    expect(schemaStage?.repairLog.some((l) => l.detail.includes("added inverse"))).toBe(true);
  });
});
