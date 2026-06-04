import type {
  DataSchema,
  AppSpec,
  Relation,
  RelationType,
  ApiEndpoint,
  Field,
} from "@/lib/schemas";
import type { RegistryView } from "@/lib/validation";
import type { RepairLogEntry, RepairResult } from "@/lib/repair/types";

// Kept local (small) so the repair module stays self-contained.
function counterpartTypes(type: RelationType): RelationType[] {
  return type === "belongsTo" ? ["hasMany", "hasOne"] : ["belongsTo"];
}
function primaryInverse(type: RelationType): RelationType {
  return type === "belongsTo" ? "hasMany" : "belongsTo";
}

function tenantField(): Field {
  return {
    name: "tenantId",
    type: "uuid",
    nullable: false,
    isRelation: false,
    isPrimary: false,
    isUnique: false,
  };
}

function crudEndpoint(entity: string): ApiEndpoint {
  return {
    path: `/api/${entity.toLowerCase()}s`,
    method: "GET",
    handlerDescription: `List ${entity} records`,
    entity,
    authRequired: true,
    rateLimit: false,
  };
}

/**
 * Consistency repair for a DataSchema. Deterministic — no LLM:
 *  - MISSING_TENANT_ID         -> add a tenantId field
 *  - RELATION_TARGET_MISSING   -> drop the dangling relation
 *  - RELATION_NOT_BIDIRECTIONAL -> synthesize the missing inverse relation
 */
export function repairDataSchemaConsistency(input: DataSchema): RepairResult<DataSchema> {
  const log: RepairLogEntry[] = [];

  // Clone so we never mutate the caller's object.
  const entities = input.entities.map((e) => ({
    ...e,
    fields: [...e.fields],
    relations: [...e.relations],
  }));
  const entityNames = new Set(entities.map((e) => e.name));

  for (const e of entities) {
    // Add a missing tenantId — normalize so tenant_id / tenantId / tenantID are equivalent.
    const hasTenant = e.fields.some((f) => f.name.replace(/[_-]/g, "").toLowerCase() === "tenantid");
    if (!hasTenant) {
      e.fields.push(tenantField());
      log.push({
        strategy: "consistency",
        errorInput: `entity "${e.name}" missing tenantId`,
        outcome: "repaired",
        detail: `added tenantId field to "${e.name}"`,
      });
    }
    // Drop relations whose target does not exist.
    e.relations = e.relations.filter((r) => {
      if (entityNames.has(r.target)) return true;
      log.push({
        strategy: "consistency",
        errorInput: `relation on "${e.name}" -> unknown entity "${r.target}"`,
        outcome: "repaired",
        detail: `dropped dangling relation ${e.name} -> ${r.target}`,
      });
      return false;
    });
  }

  // Add missing inverse relations. Snapshot the (entity, relation) pairs first
  // so pushing inverses doesn't disturb iteration (handles self-relations too).
  const byName = new Map(entities.map((e) => [e.name, e]));
  const pairs = entities.flatMap((e) => e.relations.map((r) => ({ from: e, rel: r })));
  for (const { from, rel } of pairs) {
    const target = byName.get(rel.target);
    if (!target) continue;
    const inverseTypes = counterpartTypes(rel.type);
    const hasInverse = target.relations.some(
      (x) =>
        x.target === from.name &&
        x.foreignKey === rel.foreignKey &&
        inverseTypes.includes(x.type),
    );
    if (!hasInverse) {
      const inverse: Relation = {
        type: primaryInverse(rel.type),
        target: from.name,
        foreignKey: rel.foreignKey,
        onDelete: rel.onDelete,
      };
      target.relations.push(inverse);
      log.push({
        strategy: "consistency",
        errorInput: `missing inverse for ${from.name} ${rel.type} ${rel.target}`,
        outcome: "repaired",
        detail: `added inverse ${rel.target} ${inverse.type} ${from.name} (fk ${rel.foreignKey})`,
      });
    }
  }

  return { data: { entities }, log, unresolved: [] };
}

/**
 * Consistency repair for an AppSpec. Deterministic — no LLM:
 *  - PAGE_WITHOUT_API        -> synthesize a CRUD endpoint for the entity
 *  - PERMISSION_ROLE_UNKNOWN -> add the missing role to authRules.roles
 *  - dangling entity refs / unregistered integrations / invalid actions -> drop
 */
export function repairAppSpecConsistency(
  input: AppSpec,
  dataSchema: DataSchema,
  registry: RegistryView,
): RepairResult<AppSpec> {
  const log: RepairLogEntry[] = [];
  const entityNames = new Set(dataSchema.entities.map((e) => e.name));

  // Drop pages bound to unknown entities.
  const pages = input.pages.filter((p) => {
    if (entityNames.has(p.entity)) return true;
    log.push({
      strategy: "consistency",
      errorInput: `page "${p.name}" -> unknown entity "${p.entity}"`,
      outcome: "repaired",
      detail: `dropped page "${p.name}" (no such entity)`,
    });
    return false;
  });

  // Drop endpoints bound to unknown entities.
  const apiEndpoints = input.apiEndpoints.filter((ep) => {
    if (entityNames.has(ep.entity)) return true;
    log.push({
      strategy: "consistency",
      errorInput: `endpoint ${ep.method} ${ep.path} -> unknown entity "${ep.entity}"`,
      outcome: "repaired",
      detail: `dropped endpoint ${ep.method} ${ep.path} (no such entity)`,
    });
    return false;
  });

  // Synthesize an endpoint for any page whose entity has none.
  const entitiesWithEndpoint = new Set(apiEndpoints.map((ep) => ep.entity));
  for (const p of pages) {
    if (!entitiesWithEndpoint.has(p.entity)) {
      apiEndpoints.push(crudEndpoint(p.entity));
      entitiesWithEndpoint.add(p.entity);
      log.push({
        strategy: "consistency",
        errorInput: `page "${p.name}" (entity ${p.entity}) has no API endpoint`,
        outcome: "repaired",
        detail: `synthesized GET /api/${p.entity.toLowerCase()}s for "${p.entity}"`,
      });
    }
  }

  // Permissions: add unknown roles; drop permissions on unknown entities.
  const roles = [...input.authRules.roles];
  const roleSet = new Set(roles);
  const permissions = input.authRules.permissions.filter((perm) => {
    if (!entityNames.has(perm.entity)) {
      log.push({
        strategy: "consistency",
        errorInput: `permission -> unknown entity "${perm.entity}"`,
        outcome: "repaired",
        detail: `dropped permission on unknown entity "${perm.entity}"`,
      });
      return false;
    }
    if (!roleSet.has(perm.role)) {
      roles.push(perm.role);
      roleSet.add(perm.role);
      log.push({
        strategy: "consistency",
        errorInput: `permission references undefined role "${perm.role}"`,
        outcome: "repaired",
        detail: `added missing role "${perm.role}" to authRules.roles`,
      });
    }
    return true;
  });

  // Hooks: drop unregistered integrations or invalid actions.
  const integrationHooks = input.integrationHooks.filter((h) => {
    if (!registry.has(h.integration)) {
      log.push({
        strategy: "consistency",
        errorInput: `hook -> unregistered integration "${h.integration}"`,
        outcome: "repaired",
        detail: `dropped hook for unregistered integration "${h.integration}"`,
      });
      return false;
    }
    if (!registry.hasAction(h.integration, h.action)) {
      log.push({
        strategy: "consistency",
        errorInput: `hook "${h.integration}" -> invalid action "${h.action}"`,
        outcome: "repaired",
        detail: `dropped hook with invalid action "${h.action}" on "${h.integration}"`,
      });
      return false;
    }
    return true;
  });

  // Workflow stubs: drop unknown trigger entity / unregistered integration / invalid action.
  const workflowStubs = input.workflowStubs.filter((s) => {
    if (!entityNames.has(s.trigger.entity)) {
      log.push({
        strategy: "consistency",
        errorInput: `workflow "${s.name}" -> unknown entity "${s.trigger.entity}"`,
        outcome: "repaired",
        detail: `dropped workflow "${s.name}" (no such entity)`,
      });
      return false;
    }
    if (!registry.has(s.integration) || !registry.hasAction(s.integration, s.action)) {
      log.push({
        strategy: "consistency",
        errorInput: `workflow "${s.name}" -> invalid integration/action ${s.integration}.${s.action}`,
        outcome: "repaired",
        detail: `dropped workflow "${s.name}" (invalid integration/action)`,
      });
      return false;
    }
    return true;
  });

  return {
    data: { pages, apiEndpoints, authRules: { roles, permissions }, integrationHooks, workflowStubs },
    log,
    unresolved: [],
  };
}
