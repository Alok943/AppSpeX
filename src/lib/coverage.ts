import type { AppIntent, DataSchema, AppSpec } from "@/lib/schemas";

export type CoverageStatus = "ok" | "partial" | "missing";

export interface CoverageItem {
  name: string;
  status: CoverageStatus;
}

export interface CoverageSummary {
  entities: CoverageItem[];
  integrations: CoverageItem[];
  businessRules: CoverageItem[];
  features: CoverageItem[];
  overallPercent: number;
}

function matchText(phrase: string, haystack: string): CoverageStatus {
  const p = phrase.toLowerCase();
  const h = haystack.toLowerCase();

  if (h.includes(p)) return "ok";

  const numbers = p.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    const allNumbersPresent = numbers.every((n) => h.includes(n));
    if (allNumbersPresent) return "ok";
  }

  const words = p.split(/\s+/).filter((w) => w.length > 4);
  if (words.length > 0 && words.some((w) => h.includes(w))) {
    return "partial";
  }

  return "missing";
}

export function computeCoverage(
  intent: AppIntent,
  appSpec: AppSpec,
  dataSchema: DataSchema,
): CoverageSummary {
  const schemaEntityNames = new Set(dataSchema.entities.map((e) => e.name.toLowerCase()));
  const entities: CoverageItem[] = intent.entities.map((e) => ({
    name: e,
    status: schemaEntityNames.has(e.toLowerCase()) ? "ok" : "missing",
  }));

  const hooksSet = new Set(appSpec.integrationHooks.map((h) => h.integration));
  const integrations: CoverageItem[] = intent.integrations_requested.map((i) => {
    const stubs = appSpec.workflowStubs.filter((w) => w.integration === i);
    const hasReal = hooksSet.has(i) || stubs.some((w) => w.source !== "synthesized");
    const isSynthesizedOnly = stubs.length > 0 && stubs.every((w) => w.source === "synthesized");

    let status: CoverageStatus = "missing";
    if (hasReal) {
      status = "ok";
    } else if (isSynthesizedOnly) {
      status = "partial";
    }
    return { name: i, status };
  });

  const workflowText = appSpec.workflowStubs
    .map((w) => `${w.trigger.condition || ""} ${w.name}`)
    .join(" ")
    .toLowerCase();

  const businessRules: CoverageItem[] = (intent.businessRules || []).map((r) => ({
    name: r,
    status: matchText(r, workflowText),
  }));

  const appSpecText = [
    ...appSpec.pages.map((p) => p.name),
    ...dataSchema.entities.map((e) => e.name),
    ...dataSchema.entities.flatMap((e) => e.fields.map((f) => f.name)),
    ...appSpec.workflowStubs.map((w) => w.name),
  ]
    .join(" ")
    .toLowerCase();

  const features: CoverageItem[] = intent.features.map((f) => ({
    name: f,
    status: matchText(f, appSpecText),
  }));

  const allItems = [...entities, ...integrations, ...businessRules, ...features];
  const totalItems = allItems.length;
  let score = 0;
  for (const item of allItems) {
    if (item.status === "ok") score += 1;
    else if (item.status === "partial") score += 0.5;
  }

  const overallPercent = totalItems > 0 ? Math.round((score / totalItems) * 100) : 100;

  return { entities, integrations, businessRules, features, overallPercent };
}
