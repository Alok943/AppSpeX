import { describe, it, expect } from "vitest";
import { fieldRepair } from "@/lib/repair/field";
import { AppIntentSchema } from "@/lib/schemas";

const completeIntent = {
  appName: "CRM",
  appType: "crm",
  features: ["leads"],
  entities: ["Lead"],
  integrations_requested: [],
  assumptions: [],
  clarification_required: false,
  clarification_question: null,
};

describe("fieldRepair", () => {
  it("fills missing array/boolean fields with typed defaults", () => {
    const { features, assumptions, clarification_required, ...partial } = completeIntent;
    void features;
    void assumptions;
    void clarification_required;

    const { data, log, unresolved } = fieldRepair(partial, AppIntentSchema);
    expect(data).not.toBeNull();
    expect(data?.features).toEqual([]);
    expect(data?.assumptions).toEqual([]);
    expect(data?.clarification_required).toBe(false);
    expect(unresolved).toHaveLength(0);
    expect(log.every((l) => l.outcome === "repaired")).toBe(true);
  });

  it("coerces a wrongly-typed field to a typed default", () => {
    const bad = { ...completeIntent, features: "leads, deals" }; // string, not array
    const { data } = fieldRepair(bad, AppIntentSchema);
    expect(data?.features).toEqual([]);
  });

  it("escalates a missing enum value it cannot safely guess", () => {
    const { appType, ...partial } = completeIntent;
    void appType;
    const { data, unresolved, log } = fieldRepair(partial, AppIntentSchema);
    expect(data).toBeNull();
    expect(unresolved.some((e) => e.path === "appType")).toBe(true);
    expect(log.some((l) => l.outcome === "escalated")).toBe(true);
  });
});
