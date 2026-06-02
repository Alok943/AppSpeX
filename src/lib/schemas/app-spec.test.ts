import { describe, it, expect } from "vitest";
import { AppSpecSchema } from "@/lib/schemas/app-spec";

const page = {
  name: "Deals",
  route: "/deals",
  layout: "list",
  entity: "Deal",
  components: ["table"],
};

const endpoint = {
  path: "/api/deals",
  method: "GET",
  handlerDescription: "List all deals",
  entity: "Deal",
  authRequired: true,
  rateLimit: false,
};

const stub = {
  name: "Notify on deal closed",
  trigger: { entity: "Deal", event: "status_changed", condition: "status === 'closed'" },
  integration: "whatsapp",
  action: "send_template_message",
  payload: [{ source: "deal.client_phone", target: "to" }],
};

const validSpec = {
  pages: [page],
  apiEndpoints: [endpoint],
  authRules: {
    roles: ["admin", "agent"],
    permissions: [{ role: "admin", entity: "Deal", actions: ["read", "write", "delete"] }],
  },
  integrationHooks: [{ integration: "whatsapp", action: "send_template_message" }],
  workflowStubs: [stub],
};

describe("AppSpecSchema (shape only)", () => {
  it("accepts a well-formed spec", () => {
    expect(AppSpecSchema.safeParse(validSpec).success).toBe(true);
  });

  it("rejects an invalid HTTP method", () => {
    const bad = { ...validSpec, apiEndpoints: [{ ...endpoint, method: "FETCH" }] };
    expect(AppSpecSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid trigger event", () => {
    const bad = {
      ...validSpec,
      workflowStubs: [{ ...stub, trigger: { ...stub.trigger, event: "closed" } }],
    };
    expect(AppSpecSchema.safeParse(bad).success).toBe(false);
  });
});
