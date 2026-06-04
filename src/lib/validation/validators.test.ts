import { describe, it, expect } from "vitest";
import {
  validateDataSchema,
  validateAppSpec,
  type RegistryView,
  type ValidationErrorCode,
} from "@/lib/validation";
import type { DataSchema } from "@/lib/schemas";

// --- helpers ----------------------------------------------------------------

const tenantField = {
  name: "tenantId",
  type: "uuid" as const,
  nullable: false,
  isRelation: false,
  isPrimary: false,
  isUnique: false,
};

/** Deal belongsTo Agent / Agent hasMany Deal — bidirectionally consistent. */
const consistentSchema: DataSchema = {
  entities: [
    {
      name: "Deal",
      description: "mock",
      tableName: "deals",
      fields: [tenantField],
      relations: [{ type: "belongsTo", target: "Agent", foreignKey: "agent_id", onDelete: "cascade" }],
    },
    {
      name: "Agent",
      description: "mock",
      tableName: "agents",
      fields: [tenantField],
      relations: [{ type: "hasMany", target: "Deal", foreignKey: "agent_id", onDelete: "cascade" }],
    },
  ],
};

const fakeRegistry: RegistryView = {
  has: (id) => id === "whatsapp",
  hasAction: (id, action) => id === "whatsapp" && action === "send_template_message",
};

function codes(errors: { code: ValidationErrorCode }[]): ValidationErrorCode[] {
  return errors.map((e) => e.code);
}

// --- DataSchema semantics ---------------------------------------------------

describe("validateDataSchema", () => {
  it("passes a consistent schema with tenantId on every entity", () => {
    const { result } = validateDataSchema(consistentSchema);
    expect(result.valid).toBe(true);
  });

  it("passes a schema where tenant field is named tenant_id", () => {
    const schemaWithTenantId: DataSchema = {
      entities: [
        {
          name: "Deal",
          description: "mock",
          tableName: "deals",
          fields: [{ ...tenantField, name: "tenant_id" }],
          relations: [],
        }
      ]
    };
    const { result } = validateDataSchema(schemaWithTenantId);
    expect(result.valid).toBe(true);
  });

  it("flags an entity missing tenantId", () => {
    const bad: DataSchema = {
      entities: [{ name: "Note", description: "mock", tableName: "notes", fields: [], relations: [] }],
    };
    const { result } = validateDataSchema(bad);
    expect(codes(result.errors)).toContain("MISSING_TENANT_ID");
  });

  it("flags a relation to a non-existent entity", () => {
    const bad: DataSchema = {
      entities: [
        {
          name: "Deal",
          description: "mock",
          tableName: "deals",
          fields: [tenantField],
          relations: [{ type: "belongsTo", target: "Ghost", foreignKey: "ghost_id", onDelete: "cascade" }],
        },
      ],
    };
    const { result } = validateDataSchema(bad);
    expect(codes(result.errors)).toContain("RELATION_TARGET_MISSING");
  });

  it("flags a relation with no matching inverse", () => {
    const bad: DataSchema = {
      entities: [
        {
          name: "Deal",
          description: "mock",
          tableName: "deals",
          fields: [tenantField],
          relations: [{ type: "belongsTo", target: "Agent", foreignKey: "agent_id", onDelete: "cascade" }],
        },
        // Agent has NO inverse hasMany Deal.
        { name: "Agent", description: "mock", tableName: "agents", fields: [tenantField], relations: [] },
      ],
    };
    const { result } = validateDataSchema(bad);
    expect(codes(result.errors)).toContain("RELATION_NOT_BIDIRECTIONAL");
  });
});

// --- AppSpec cross-layer semantics ------------------------------------------

const baseSpec = {
  pages: [{ name: "Deals", route: "/deals", layout: "list", entity: "Deal", components: ["table"] }],
  apiEndpoints: [
    { path: "/api/deals", method: "GET", handlerDescription: "List deals", entity: "Deal", authRequired: true, rateLimit: false },
  ],
  authRules: { roles: ["admin"], permissions: [{ role: "admin", entity: "Deal", actions: ["read"] }] },
  integrationHooks: [{ integration: "whatsapp", action: "send_template_message" }],
  workflowStubs: [
    {
      name: "Notify",
      trigger: { entity: "Deal", event: "status_changed", condition: null },
      integration: "whatsapp",
      action: "send_template_message",
      payload: [{ source: "deal.phone", target: "to" }],
    },
  ],
};

describe("validateAppSpec", () => {
  it("passes a coherent spec", () => {
    const { result } = validateAppSpec(baseSpec, consistentSchema, fakeRegistry);
    expect(result.valid).toBe(true);
  });

  it("flags a page bound to an unknown entity", () => {
    const bad = { ...baseSpec, pages: [{ ...baseSpec.pages[0], entity: "Ghost" }] };
    const { result } = validateAppSpec(bad, consistentSchema, fakeRegistry);
    expect(codes(result.errors)).toContain("PAGE_ENTITY_MISSING");
  });

  it("flags a page with no corresponding API endpoint", () => {
    const bad = { ...baseSpec, apiEndpoints: [] };
    const { result } = validateAppSpec(bad, consistentSchema, fakeRegistry);
    expect(codes(result.errors)).toContain("PAGE_WITHOUT_API");
  });

  it("flags a hook to an unregistered integration", () => {
    const bad = { ...baseSpec, integrationHooks: [{ integration: "telepathy", action: "send" }] };
    const { result } = validateAppSpec(bad, consistentSchema, fakeRegistry);
    expect(codes(result.errors)).toContain("HOOK_INTEGRATION_UNREGISTERED");
  });

  it("flags a hook to a registered integration but invalid action", () => {
    const bad = { ...baseSpec, integrationHooks: [{ integration: "whatsapp", action: "teleport" }] };
    const { result } = validateAppSpec(bad, consistentSchema, fakeRegistry);
    expect(codes(result.errors)).toContain("HOOK_ACTION_INVALID");
  });
});
