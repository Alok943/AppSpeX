import type { RegistryView } from "@/lib/validation";
import type { Integration, ActionDescriptor } from "@/lib/integrations/types";
import { INTEGRATION_CATALOG } from "@/lib/integrations/catalog";

/**
 * Lookup over the integration catalog. Implements `RegistryView` (has /
 * hasAction) so the validation and repair engines can depend on it through that
 * narrow port without importing the concrete catalog.
 */
export class IntegrationRegistry implements RegistryView {
  private readonly byId: Map<string, Integration>;

  constructor(integrations: Integration[]) {
    this.byId = new Map(integrations.map((i) => [i.id, i]));
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): Integration | undefined {
    return this.byId.get(id);
  }

  getAction(id: string, actionId: string): ActionDescriptor | undefined {
    return this.byId.get(id)?.actions.find((a) => a.id === actionId);
  }

  hasAction(id: string, actionId: string): boolean {
    return this.getAction(id, actionId) !== undefined;
  }

  list(): Integration[] {
    return [...this.byId.values()];
  }
}

/** Shared registry instance built from the catalog. */
export const integrationRegistry = new IntegrationRegistry(INTEGRATION_CATALOG);
