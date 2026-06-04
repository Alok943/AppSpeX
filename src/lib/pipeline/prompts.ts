import type { AppIntent, DataSchema } from "@/lib/schemas";
import type { IntegrationRegistry } from "@/lib/integrations";

export interface Prompt {
  system: string;
  user: string;
}

/** Appended to the user message when re-prompting after a failed attempt. */
function correctionBlock(note?: string): string {
  if (!note) return "";
  return `\n\nThe previous attempt was invalid. Fix exactly these problems and return corrected JSON only:\n${note}`;
}

// --- Stage 1: Intent --------------------------------------------------------

export function buildIntentPrompt(rawPrompt: string, note?: string): Prompt {
  const system = [
    "You are the intent-extraction stage of an app-generation pipeline.",
    "Output ONE JSON object only — no markdown, no prose — matching this schema:",
    "{",
    '  "appName": string,',
    '  "appType": "crm" | "project_management" | "ecommerce" | "hr_tool" | "inventory" | "content_platform" | "analytics" | "custom",',
    '  "features": string[],',
    '  "entities": string[],',
    '  "integrations_requested": string[],',
    '  "assumptions": string[],',
    '  "clarification_required": boolean,',
    '  "clarification_question": string | null',
    "}",
    "Rules:",
    "- appType MUST be one of the listed values.",
    "- entities are core domain nouns (PascalCase, singular), e.g. Lead, Deal, Property.",
    "- integrations_requested are lowercase ids of any third-party services mentioned, using these ids when applicable: slack, whatsapp, stripe, gmail, jira, google_sheets, salesforce, hubspot, notion, airtable, twilio_sms, github, zapier, webhook.",
    "- CLARIFICATION POLICY: if you cannot confidently determine BOTH the appType AND at least one entity, set clarification_required=true and put exactly ONE specific question in clarification_question (still fill the other fields with best-effort guesses).",
    "- Otherwise set clarification_required=false and clarification_question=null, and record every assumption you made (overscoped prompts: reduce to an MVP and list the cuts; conflicting domains: pick one primary domain and state the decision; vague modifiers like 'smart': define what you assumed) in assumptions[].",
  ].join("\n");

  const user = `App description:\n"""${rawPrompt}"""${correctionBlock(note)}`;
  return { system, user };
}

// --- Stage 2: Schema --------------------------------------------------------

export function buildSchemaPrompt(intent: AppIntent, note?: string): Prompt {
  const system = [
    "You are the schema-generation stage. Given an AppIntent, output ONE JSON object only matching:",
    '{ "entities": EntitySchema[] }',
    "EntitySchema = {",
    '  "name": string (PascalCase),',
    '  "tableName": string (snake_case, plural),',
    '  "fields": Field[],',
    '  "relations": Relation[]',
    "}",
    'Field = { "name": string, "type": "string"|"text"|"integer"|"float"|"boolean"|"date"|"datetime"|"uuid"|"json", "nullable": boolean, "isRelation": boolean, "isPrimary": boolean, "isUnique": boolean }',
    'Relation = { "type": "hasMany"|"belongsTo"|"hasOne", "target": string (an entity name), "foreignKey": string (snake_case), "onDelete": "cascade"|"set_null"|"restrict"|"no_action" }',
    "Hard rules:",
    "- Every entity MUST include an `id` field (uuid, isPrimary true) and a `tenantId` field (uuid).",
    "- Relations MUST be bidirectionally consistent: if A belongsTo B with foreignKey fk, then B MUST have a hasMany or hasOne to A with the SAME foreignKey fk.",
    "- Foreign-key fields used by relations should also appear in `fields` with isRelation=true.",
    "- Model the entities and features from the intent; add sensible fields for each entity.",
  ].join("\n");

  const user = `AppIntent:\n${JSON.stringify(intent, null, 2)}${correctionBlock(note)}`;
  return { system, user };
}

// --- Stage 3: AppSpec -------------------------------------------------------

/** Compact "id -> action ids" summary so the model only uses valid integrations. */
export function registrySummary(registry: IntegrationRegistry, ids: string[]): string {
  const wanted = new Set(ids);
  const lines = registry
    .list()
    .filter((i) => wanted.has(i.id) || i.implemented)
    .map((i) => `- ${i.id}: actions = [${i.actions.map((a) => a.id).join(", ")}]; events = [${i.triggers.map((t) => t.event).join(", ")}]`);
  return lines.join("\n");
}

export function buildAppSpecPrompt(
  dataSchema: DataSchema,
  integrationsRequested: string[],
  registry: IntegrationRegistry,
  note?: string,
): Prompt {
  const entityNames = dataSchema.entities.map((e) => e.name);
  const system = [
    "You are the app-spec generation stage. Given a DataSchema, output ONE JSON object only matching:",
    "{",
    '  "pages": [{ "name": string, "route": string, "layout": "list"|"detail"|"dashboard"|"settings", "entity": string, "components": ("table"|"form"|"chart"|"card")[] }],',
    '  "apiEndpoints": [{ "path": string, "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE", "handlerDescription": string, "entity": string, "authRequired": boolean, "rateLimit": boolean }],',
    '  "authRules": { "roles": string[], "permissions": [{ "role": string, "entity": string, "actions": ("read"|"write"|"delete")[] }] },',
    '  "integrationHooks": [{ "integration": string, "action": string }],',
    '  "workflowStubs": [{ "name": string, "trigger": { "entity": string, "event": "created"|"updated"|"deleted"|"status_changed", "condition": string | null }, "integration": string, "action": string, "payload": [{ "source": string, "target": string }] }]',
    "}",
    "Hard rules:",
    "- `entity` on every page, endpoint, permission, and workflow trigger MUST be one of these entities: " + entityNames.join(", "),
    "- Every page MUST have at least one apiEndpoint bound to the same entity.",
    "- integrationHooks and workflowStubs MUST reference ONLY these registered integrations and their listed action ids:",
    registrySummary(registry, integrationsRequested),
    "- Create at least one workflowStub for each of these requested integrations: " + (integrationsRequested.join(", ") || "(none)"),
    "- workflowStub.payload maps entity fields (source, e.g. \"Deal.client_phone\") to action input fields (target, e.g. \"to\").",
    "- Define sensible roles (e.g. admin, plus a domain role) and a permission matrix.",
  ].join("\n");

  const user = `DataSchema:\n${JSON.stringify(dataSchema, null, 2)}\n\nRequested integrations: ${JSON.stringify(integrationsRequested)}${correctionBlock(note)}`;
  return { system, user };
}
