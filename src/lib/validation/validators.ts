import { z } from "zod";
import {
  AppIntentSchema,
  DataSchema,
  AppSpecSchema,
  type AppIntent,
  type AppSpec,
  type RelationType,
} from "@/lib/schemas";
import type {
  ValidationError,
  StageValidation,
  RegistryView,
} from "@/lib/validation/types";

/** Map each Zod issue to a SCHEMA_SHAPE validation error (no throwing). */
function zodIssuesToErrors(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    code: "SCHEMA_SHAPE" as const,
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

/** The relation type(s) that form a valid inverse of the given relation type. */
function counterpartTypes(type: RelationType): RelationType[] {
  switch (type) {
    case "belongsTo":
      return ["hasMany", "hasOne"];
    case "hasMany":
      return ["belongsTo"];
    case "hasOne":
      return ["belongsTo"];
  }
}

// --- Stage 1: AppIntent (shape only — no cross-references) -------------------

export function validateIntent(raw: unknown): StageValidation<AppIntent> {
  const parsed = AppIntentSchema.safeParse(raw);
  if (!parsed.success) {
    return { result: { valid: false, errors: zodIssuesToErrors(parsed.error) }, data: null };
  }
  return { result: { valid: true, errors: [] }, data: parsed.data };
}

// --- Stage 2: DataSchema (shape + semantics) --------------------------------

export function validateDataSchema(raw: unknown): StageValidation<DataSchema> {
  const parsed = DataSchema.safeParse(raw);
  if (!parsed.success) {
    return { result: { valid: false, errors: zodIssuesToErrors(parsed.error) }, data: null };
  }
  const data = parsed.data;
  const errors: ValidationError[] = [];
  const entityNames = new Set(data.entities.map((e) => e.name));

  data.entities.forEach((entity, i) => {
    // Every entity must carry a tenantId field.
    if (!entity.fields.some((f) => f.name === "tenantId")) {
      errors.push({
        code: "MISSING_TENANT_ID",
        path: `entities[${i}]`,
        message: `Entity "${entity.name}" is missing a tenantId field.`,
        details: { entity: entity.name },
      });
    }
    // Relation targets must resolve to a real entity.
    entity.relations.forEach((rel, j) => {
      if (!entityNames.has(rel.target)) {
        errors.push({
          code: "RELATION_TARGET_MISSING",
          path: `entities[${i}].relations[${j}].target`,
          message: `Relation on "${entity.name}" targets unknown entity "${rel.target}".`,
          details: { entity: entity.name, target: rel.target },
        });
      }
    });
  });

  // Bidirectional consistency: every relation needs a matching inverse on the
  // target entity (same foreignKey, counterpart type).
  data.entities.forEach((entity, i) => {
    entity.relations.forEach((rel, j) => {
      const target = data.entities.find((e) => e.name === rel.target);
      if (!target) return; // already reported as RELATION_TARGET_MISSING
      const inverseTypes = counterpartTypes(rel.type);
      const hasInverse = target.relations.some(
        (r) =>
          r.target === entity.name &&
          r.foreignKey === rel.foreignKey &&
          inverseTypes.includes(r.type),
      );
      if (!hasInverse) {
        errors.push({
          code: "RELATION_NOT_BIDIRECTIONAL",
          path: `entities[${i}].relations[${j}]`,
          message: `Relation ${entity.name} ${rel.type} ${rel.target} (fk ${rel.foreignKey}) has no matching inverse on ${rel.target}.`,
          details: {
            from: entity.name,
            to: rel.target,
            foreignKey: rel.foreignKey,
            expectedInverseTypes: inverseTypes,
          },
        });
      }
    });
  });

  return { result: { valid: errors.length === 0, errors }, data };
}

// --- Stage 3: AppSpec (shape + cross-layer semantics) -----------------------

export function validateAppSpec(
  raw: unknown,
  dataSchema: DataSchema,
  registry: RegistryView,
): StageValidation<AppSpec> {
  const parsed = AppSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return { result: { valid: false, errors: zodIssuesToErrors(parsed.error) }, data: null };
  }
  const data = parsed.data;
  const errors: ValidationError[] = [];
  const entityNames = new Set(dataSchema.entities.map((e) => e.name));
  const roleSet = new Set(data.authRules.roles);
  const entitiesWithEndpoint = new Set(data.apiEndpoints.map((ep) => ep.entity));

  data.pages.forEach((page, i) => {
    if (!entityNames.has(page.entity)) {
      errors.push({
        code: "PAGE_ENTITY_MISSING",
        path: `pages[${i}].entity`,
        message: `Page "${page.name}" is bound to unknown entity "${page.entity}".`,
        details: { entity: page.entity },
      });
    } else if (!entitiesWithEndpoint.has(page.entity)) {
      // Every page must have at least one corresponding API endpoint.
      errors.push({
        code: "PAGE_WITHOUT_API",
        path: `pages[${i}]`,
        message: `Page "${page.name}" (entity ${page.entity}) has no corresponding API endpoint.`,
        details: { entity: page.entity },
      });
    }
  });

  data.apiEndpoints.forEach((ep, i) => {
    if (!entityNames.has(ep.entity)) {
      errors.push({
        code: "ENDPOINT_ENTITY_MISSING",
        path: `apiEndpoints[${i}].entity`,
        message: `Endpoint ${ep.method} ${ep.path} is bound to unknown entity "${ep.entity}".`,
        details: { entity: ep.entity },
      });
    }
  });

  data.authRules.permissions.forEach((perm, i) => {
    if (!roleSet.has(perm.role)) {
      errors.push({
        code: "PERMISSION_ROLE_UNKNOWN",
        path: `authRules.permissions[${i}].role`,
        message: `Permission references role "${perm.role}" that is not defined in authRules.roles.`,
        details: { role: perm.role },
      });
    }
    if (!entityNames.has(perm.entity)) {
      errors.push({
        code: "PERMISSION_ENTITY_MISSING",
        path: `authRules.permissions[${i}].entity`,
        message: `Permission references unknown entity "${perm.entity}".`,
        details: { entity: perm.entity },
      });
    }
  });

  data.integrationHooks.forEach((hook, i) => {
    if (!registry.has(hook.integration)) {
      errors.push({
        code: "HOOK_INTEGRATION_UNREGISTERED",
        path: `integrationHooks[${i}].integration`,
        message: `Hook references unregistered integration "${hook.integration}".`,
        details: { integration: hook.integration },
      });
    } else if (!registry.hasAction(hook.integration, hook.action)) {
      errors.push({
        code: "HOOK_ACTION_INVALID",
        path: `integrationHooks[${i}].action`,
        message: `Integration "${hook.integration}" has no action "${hook.action}".`,
        details: { integration: hook.integration, action: hook.action },
      });
    }
  });

  data.workflowStubs.forEach((stub, i) => {
    if (!entityNames.has(stub.trigger.entity)) {
      errors.push({
        code: "WORKFLOW_ENTITY_MISSING",
        path: `workflowStubs[${i}].trigger.entity`,
        message: `Workflow "${stub.name}" triggers on unknown entity "${stub.trigger.entity}".`,
        details: { entity: stub.trigger.entity },
      });
    }
    if (!registry.has(stub.integration)) {
      errors.push({
        code: "WORKFLOW_INTEGRATION_UNREGISTERED",
        path: `workflowStubs[${i}].integration`,
        message: `Workflow "${stub.name}" references unregistered integration "${stub.integration}".`,
        details: { integration: stub.integration },
      });
    } else if (!registry.hasAction(stub.integration, stub.action)) {
      errors.push({
        code: "WORKFLOW_ACTION_INVALID",
        path: `workflowStubs[${i}].action`,
        message: `Integration "${stub.integration}" has no action "${stub.action}".`,
        details: { integration: stub.integration, action: stub.action },
      });
    }
  });

  return { result: { valid: errors.length === 0, errors }, data };
}
