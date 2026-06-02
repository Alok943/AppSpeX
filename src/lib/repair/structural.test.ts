import { describe, it, expect } from "vitest";
import { structuralRepair } from "@/lib/repair/structural";

describe("structuralRepair", () => {
  it("recovers JSON wrapped in markdown code fences", () => {
    const raw = '```json\n{"appName":"CRM","appType":"crm"}\n```';
    const r = structuralRepair(raw);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ appName: "CRM", appType: "crm" });
    expect(r.log.outcome).toBe("repaired");
  });

  it("recovers JSON surrounded by prose", () => {
    const raw = 'Sure! Here is your spec:\n{"appName":"CRM"}\nHope that helps.';
    const r = structuralRepair(raw);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ appName: "CRM" });
  });

  it("recovers truncated JSON", () => {
    const raw = '{"appName":"CRM","features":["a","b"'; // cut off mid-array
    const r = structuralRepair(raw);
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ appName: "CRM" });
    expect(r.log.detail).toContain("jsonrepair");
  });

  it("recovers JSON with trailing commas", () => {
    const raw = '{"appName":"CRM","entities":["Lead",],}';
    const r = structuralRepair(raw);
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ appName: "CRM" });
  });

  it("fails cleanly on text with no JSON at all", () => {
    const r = structuralRepair("I cannot help with that request.");
    expect(r.ok).toBe(false);
    expect(r.value).toBeNull();
    expect(r.log.outcome).toBe("failed");
  });
});
