import { describe, it, expect } from "vitest";
import { AppIntentSchema } from "@/lib/schemas/intent";

describe("AppIntentSchema", () => {
  it("accepts a well-formed intent", () => {
    const good = {
      appName: "Real Estate CRM",
      appType: "crm",
      features: ["manage leads", "view analytics"],
      entities: ["Lead", "Property", "Deal"],
      integrations_requested: ["whatsapp"],
      businessRules: ["trigger notifications when a deal closes"],
      assumptions: [],
      clarification_required: false,
      clarification_question: null,
    };
    const result = AppIntentSchema.safeParse(good);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid appType WITHOUT throwing, returning a structured error", () => {
    const bad = {
      appName: "Real Estate CRM",
      appType: "CRM", // wrong casing -> not in the enum
      features: [],
      entities: ["Lead"],
      integrations_requested: [],
      assumptions: [],
      clarification_required: false,
      clarification_question: null,
    };
    const result = AppIntentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error points at exactly which field failed — this is what the
      // repair engine will read to decide a fix strategy.
      expect(result.error.issues[0]?.path).toEqual(["appType"]);
    }
  });
});
