import { z } from "zod";

/**
 * Stage 3 output: AppSpec — the final, machine-readable application spec a
 * downstream code generator would consume.
 *
 * SHAPE only (same rule as DataSchema). Cross-layer coherence — every page has
 * an API, every workflowStub references a real entity, every hook references a
 * registered integration + valid action, every permission role exists — lives
 * in the validation engine as named, repairable checks.
 */

export const LayoutEnum = z.enum(["list", "detail", "dashboard", "settings"]);
export type Layout = z.infer<typeof LayoutEnum>;

export const ComponentEnum = z.enum(["table", "form", "chart", "card"]);
export type ComponentKind = z.infer<typeof ComponentEnum>;

export const HttpMethodEnum = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export type HttpMethod = z.infer<typeof HttpMethodEnum>;

export const PermissionActionEnum = z.enum(["read", "write", "delete"]);
export type PermissionAction = z.infer<typeof PermissionActionEnum>;

export const TriggerEventEnum = z.enum([
  "created",
  "updated",
  "deleted",
  "status_changed",
]);
export type TriggerEvent = z.infer<typeof TriggerEventEnum>;

export const PageSchema = z.object({
  name: z.string().min(1),
  route: z.string().min(1),
  layout: LayoutEnum,
  /** Bound entity name. Required so "every page has an API" is checkable. */
  entity: z.string().min(1),
  components: z.array(ComponentEnum),
});
export type Page = z.infer<typeof PageSchema>;

export const ApiEndpointSchema = z.object({
  path: z.string().min(1),
  method: HttpMethodEnum,
  handlerDescription: z.string().min(1),
  entity: z.string().min(1),
  authRequired: z.boolean(),
  rateLimit: z.boolean(),
});
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;

/** One row of the permission matrix: what a role may do to an entity. */
export const PermissionSchema = z.object({
  role: z.string().min(1),
  entity: z.string().min(1),
  actions: z.array(PermissionActionEnum),
});
export type Permission = z.infer<typeof PermissionSchema>;

export const AuthRulesSchema = z.object({
  roles: z.array(z.string().min(1)),
  permissions: z.array(PermissionSchema),
});
export type AuthRules = z.infer<typeof AuthRulesSchema>;

/** References a registry integration by id + one of its action ids. */
export const IntegrationHookSchema = z.object({
  integration: z.string().min(1),
  action: z.string().min(1),
});
export type IntegrationHook = z.infer<typeof IntegrationHookSchema>;

/** A single entity-field -> action-input-field mapping. */
export const PayloadMappingSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
});
export type PayloadMapping = z.infer<typeof PayloadMappingSchema>;

export const WorkflowStubSchema = z.object({
  name: z.string().min(1),
  trigger: z.object({
    entity: z.string().min(1),
    event: TriggerEventEnum,
    /** Optional filter, e.g. "status === 'closed'". */
    condition: z.string().nullable(),
  }),
  integration: z.string().min(1),
  action: z.string().min(1),
  payload: z.array(PayloadMappingSchema),
});
export type WorkflowStub = z.infer<typeof WorkflowStubSchema>;

export const AppSpecSchema = z.object({
  pages: z.array(PageSchema),
  apiEndpoints: z.array(ApiEndpointSchema),
  authRules: AuthRulesSchema,
  integrationHooks: z.array(IntegrationHookSchema),
  workflowStubs: z.array(WorkflowStubSchema),
});
export type AppSpec = z.infer<typeof AppSpecSchema>;
