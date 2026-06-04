import type { AppSpec, DataSchema, WorkflowStub } from "@/lib/schemas";
import type { IntegrationRegistry } from "@/lib/integrations";
import type { RepairLogEntry } from "@/lib/repair";

/** Normalize a free-form integration name to a registry id ("Google Sheets" -> "google_sheets"). */
export function normalizeIntegrationId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Deterministic guarantee that every requested+registered integration has at
 * least one workflowStub. Synthesizes a default stub (first action, first
 * entity, required-field payload mapping) for any that the model missed.
 */
export function ensureWorkflowCoverage(
  appSpec: AppSpec,
  integrationsRequested: string[],
  dataSchema: DataSchema,
  registry: IntegrationRegistry,
): { appSpec: AppSpec; log: RepairLogEntry[] } {
  const log: RepairLogEntry[] = [];
  const stubs = [...appSpec.workflowStubs];
  const covered = new Set(stubs.map((s) => s.integration));
  const firstEntity = dataSchema.entities[0];

  for (const rawId of integrationsRequested) {
    const id = normalizeIntegrationId(rawId);
    const integration = registry.get(id);
    if (!integration || covered.has(id)) continue;

    const action = integration.actions[0];
    if (!action || !firstEntity) continue;

    const stub: WorkflowStub = {
      name: `${integration.displayName} on ${firstEntity.name} change`,
      trigger: { entity: firstEntity.name, event: "status_changed", condition: null },
      integration: id,
      action: action.id,
      payload: action.input
        .filter((f) => f.required)
        .map((f) => ({ source: `${firstEntity.name}.id`, target: f.name })),
    };
    stubs.push(stub);
    covered.add(id);
    log.push({
      strategy: "consistency",
      errorInput: `no workflowStub for requested integration "${id}"`,
      outcome: "repaired",
      detail: `synthesized default workflowStub for "${id}" (${action.id})`,
    });
  }

  return { appSpec: { ...appSpec, workflowStubs: stubs }, log };
}
