import { describe, it, expect } from "vitest";
import { integrationRegistry } from "@/lib/integrations";

describe("integrationRegistry", () => {
  it("registers all 14 integrations from the catalog", () => {
    expect(integrationRegistry.list()).toHaveLength(14);
  });

  it("has at least 5 fully implemented integrations", () => {
    const implemented = integrationRegistry.list().filter((i) => i.implemented);
    expect(implemented.length).toBeGreaterThanOrEqual(5);
  });

  it("resolves has() and hasAction()", () => {
    expect(integrationRegistry.has("slack")).toBe(true);
    expect(integrationRegistry.has("nonexistent")).toBe(false);
    expect(integrationRegistry.hasAction("slack", "send_message")).toBe(true);
    expect(integrationRegistry.hasAction("slack", "teleport")).toBe(false);
  });

  it("registers the integrations the eval prompts rely on", () => {
    // WhatsApp + Google Sheets must be present with their key actions so the
    // generated workflowStubs validate, even though they are not fully built.
    expect(integrationRegistry.hasAction("whatsapp", "send_template_message")).toBe(true);
    expect(integrationRegistry.hasAction("google_sheets", "append_row")).toBe(true);
    expect(integrationRegistry.hasAction("stripe", "create_charge")).toBe(true);
    expect(integrationRegistry.hasAction("gmail", "send_email")).toBe(true);
    expect(integrationRegistry.hasAction("jira", "create_issue")).toBe(true);
  });

  it("exposes input/output schemas on every action", () => {
    for (const integration of integrationRegistry.list()) {
      for (const action of integration.actions) {
        expect(Array.isArray(action.input)).toBe(true);
        expect(Array.isArray(action.output)).toBe(true);
      }
    }
  });
});
