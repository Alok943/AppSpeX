import type { TriggerEvent } from "@/lib/schemas";

/**
 * Integration registry types.
 *
 * This is hand-authored static metadata (not model output), so it uses plain TS
 * types rather than Zod — we validate the LLM's references *against* this
 * registry, not the registry itself.
 *
 * No live OAuth / HTTP is required by the task: action descriptors capture the
 * correct metadata (payload shape, trigger condition) so a developer could
 * implement the real call from the stub alone.
 */

export type IntegrationAuthType = "oauth2" | "api_key" | "webhook_secret" | "none";

export type ActionFieldType = "string" | "number" | "boolean" | "object" | "array";

/** One field in an action's input or output schema. */
export interface ActionField {
  name: string;
  type: ActionFieldType;
  required: boolean;
  description: string;
}

/** Something an integration can do, with typed input/output. */
export interface ActionDescriptor {
  /** Stable id referenced by AppSpec hooks/stubs, e.g. "send_message". */
  id: string;
  displayName: string;
  description: string;
  input: ActionField[];
  output: ActionField[];
}

/** An entity event this integration can react to. */
export interface TriggerDescriptor {
  event: TriggerEvent;
  description: string;
}

export interface Integration {
  /** Stable id, e.g. "slack". */
  id: string;
  displayName: string;
  authType: IntegrationAuthType;
  /**
   * true  = full, correct metadata authored and ready to implement.
   * false = registered stub with a clear interface, not yet fleshed out.
   */
  implemented: boolean;
  triggers: TriggerDescriptor[];
  actions: ActionDescriptor[];
}
