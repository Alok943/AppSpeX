import type { LlmGateway } from "@/lib/gateway";
import {
  AppIntentSchema,
  AppSpecSchema,
  DataSchema,
  type AppIntent,
  type AppSpec,
} from "@/lib/schemas";
import { validateDataSchema, validateAppSpec } from "@/lib/validation";
import { repairDataSchemaConsistency, repairAppSpecConsistency } from "@/lib/repair";
import { integrationRegistry } from "@/lib/integrations";
import { runStage, type StageOutcome } from "@/lib/pipeline/run-stage";
import { buildIntentPrompt, buildSchemaPrompt, buildAppSpecPrompt } from "@/lib/pipeline/prompts";

/** Stage 1: raw prompt -> AppIntent (shape only; no cross-layer checks). */
export function runIntentStage(prompt: string, gateway: LlmGateway): Promise<StageOutcome<AppIntent>> {
  return runStage({
    stage: "intent",
    schema: AppIntentSchema,
    gateway,
    buildPrompt: (note) => buildIntentPrompt(prompt, note),
  });
}

/** Stage 2: AppIntent -> DataSchema (semantic checks + consistency repair). */
export function runSchemaStage(intent: AppIntent, gateway: LlmGateway): Promise<StageOutcome<DataSchema>> {
  return runStage({
    stage: "schema",
    schema: DataSchema,
    gateway,
    buildPrompt: (note) => buildSchemaPrompt(intent, note),
    semanticErrors: (data) => validateDataSchema(data).result.errors,
    consistencyRepair: (data) => repairDataSchemaConsistency(data),
  });
}

/** Stage 3: DataSchema -> AppSpec (cross-layer checks against schema + registry). */
export function runAppSpecStage(
  dataSchema: DataSchema,
  integrationsRequested: string[],
  gateway: LlmGateway,
): Promise<StageOutcome<AppSpec>> {
  return runStage({
    stage: "appspec",
    schema: AppSpecSchema,
    gateway,
    buildPrompt: (note) => buildAppSpecPrompt(dataSchema, integrationsRequested, integrationRegistry, note),
    semanticErrors: (data) => validateAppSpec(data, dataSchema, integrationRegistry).result.errors,
    consistencyRepair: (data) => repairAppSpecConsistency(data, dataSchema, integrationRegistry),
  });
}
