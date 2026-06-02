import { describe, it, expect } from "vitest";
import { repairDataSchemaConsistency, repairAppSpecConsistency } from "@/lib/repair";
import { validateDataSchema, validateAppSpec, type RegistryView } from "@/lib/validation";
import type { DataSchema, AppSpec } from "@/lib/schemas";

const registry: RegistryView = {
  has: (id) => id === "whatsapp",
  hasAction: (id, action) => id === "whatsapp" && action === "send_template_message",
};

describe("repairDataSchemaConsistency", () => {
  it("adds tenantId and the missing inverse so the schema validates", () => {
    const broken: DataSchema = {
      entities: [
        {
          name: "Deal",
          tableName: "deals",
          fields: [], // missing tenantId
          relations: [{ type: "belongsTo", target: "Agent", foreignKey: "agent_id", onDelete: "cascade" }],
        },
        {
          name: "Agent",
          tableName: "agents",
          fields: [], // missing tenantId
          relations: [], // missing inverse hasMany Deal
        },
      ],
    };

    const { data, log } = repairDataSchemaConsistency(broken);
    // The repaired schema must now pass validation.
    expect(validateDataSchema(data).result.valid).toBe(true);
    expect(log.some((l) => l.detail.includes("added tenantId"))).toBe(true);
    expect(log.some((l) => l.detail.includes("added inverse"))).toBe(true);
  });

  it("drops a relation that targets a non-existent entity", () => {
    const broken: DataSchema = {
      entities: [
        {
          name: "Deal",
          tableName: "deals",
          fields: [
            { name: "tenantId", type: "uuid", nullable: false, isRelation: false, isPrimary: false, isUnique: false },
          ],
          relations: [{ type: "belongsTo", target: "Ghost", foreignKey: "ghost_id", onDelete: "cascade" }],
        },
      ],
    };
    const { data, log } = repairDataSchemaConsistency(broken);
    expect(validateDataSchema(data).result.valid).toBe(true);
    expect(log.some((l) => l.detail.includes("dropped dangling"))).toBe(true);
  });
});

describe("repairAppSpecConsistency", () => {
  const dataSchema: DataSchema = {
    entities: [
      { name: "Deal", tableName: "deals", fields: [{ name: "tenantId", type: "uuid", nullable: false, isRelation: false, isPrimary: false, isUnique: false }], relations: [] },
    ],
  };

  it("synthesizes an endpoint and adds a missing role so the spec validates", () => {
    const broken: AppSpec = {
      pages: [{ name: "Deals", route: "/deals", layout: "list", entity: "Deal", components: ["table"] }],
      apiEndpoints: [], // page has no API
      authRules: {
        roles: [], // 'admin' below is undefined
        permissions: [{ role: "admin", entity: "Deal", actions: ["read"] }],
      },
      integrationHooks: [],
      workflowStubs: [],
    };

    const { data, log } = repairAppSpecConsistency(broken, dataSchema, registry);
    expect(validateAppSpec(data, dataSchema, registry).result.valid).toBe(true);
    expect(log.some((l) => l.detail.includes("synthesized"))).toBe(true);
    expect(log.some((l) => l.detail.includes("added missing role"))).toBe(true);
  });

  it("drops hooks to unregistered integrations", () => {
    const broken: AppSpec = {
      pages: [],
      apiEndpoints: [],
      authRules: { roles: [], permissions: [] },
      integrationHooks: [{ integration: "telepathy", action: "send" }],
      workflowStubs: [],
    };
    const { data, log } = repairAppSpecConsistency(broken, dataSchema, registry);
    expect(data.integrationHooks).toHaveLength(0);
    expect(log.some((l) => l.detail.includes("unregistered integration"))).toBe(true);
  });
});
