import { z } from "zod";

/**
 * Stage 1 output: AppIntent.
 *
 * Parsed from the user's raw prompt. This schema is BOTH the runtime validator
 * (via `safeParse`) and the source of the `AppIntent` TypeScript type (via
 * `z.infer`), so the two can never drift apart.
 */

/**
 * The kind of app the user wants. A closed enum means the LLM cannot invent a
 * type — anything outside this list fails validation and gets repaired. This is
 * stricter (and safer) than a free-form string.
 */
export const AppTypeEnum = z.enum([
  "crm",
  "project_management",
  "ecommerce",
  "hr_tool",
  "inventory",
  "content_platform",
  "analytics",
  "custom",
]);
export type AppType = z.infer<typeof AppTypeEnum>;

export const AppIntentSchema = z.object({
  /** Short human name for the app, e.g. "Real Estate CRM". */
  appName: z.string().min(1),
  /** One of the known app categories (see AppTypeEnum). */
  appType: AppTypeEnum,
  /** Capabilities the user asked for, e.g. ["manage leads", "view analytics"]. */
  features: z.array(z.string()),
  /** Core domain nouns, e.g. ["Lead", "Property", "Deal"]. Become entities in Stage 2. */
  entities: z.array(z.string()),
  /** Third-party services mentioned, e.g. ["whatsapp", "slack"]. Drive workflow stubs. */
  integrations_requested: z.array(z.string()),
  /** Decisions the system made when the prompt was underspecified. Always documented. */
  assumptions: z.array(z.string()),

  /**
   * Clarification policy (chosen for this build): when the prompt is too vague
   * to identify the app — i.e. we cannot confidently determine both an
   * `appType` AND at least one entity — Stage 1 sets this flag and the pipeline
   * halts after Stage 1, surfacing exactly one question. Otherwise it proceeds
   * with documented `assumptions`.
   */
  clarification_required: z.boolean(),
  /** The single clarifying question. Non-null only when clarification_required is true. */
  clarification_question: z.string().nullable(),
});

export type AppIntent = z.infer<typeof AppIntentSchema>;
