import type { LlmGateway, StageName } from "@/lib/gateway";
import { gateway as defaultGateway } from "@/lib/gateway";
import { integrationRegistry } from "@/lib/integrations";
import type { AppIntent, DataSchema, AppSpec } from "@/lib/schemas";
import type { ValidationError } from "@/lib/validation";
import type { RepairLogEntry } from "@/lib/repair";
import { runIntentStage, runSchemaStage, runAppSpecStage } from "@/lib/pipeline/stages";
import { ensureWorkflowCoverage } from "@/lib/pipeline/workflow-coverage";
import type { StageOutcome, StageTelemetry } from "@/lib/pipeline/run-stage";

/** Per-stage summary stored in the result and replayed over SSE. */
export interface StageReport {
  stage: StageName;
  ok: boolean;
  errors: ValidationError[];
  repairLog: RepairLogEntry[];
  telemetry: StageTelemetry;
}

export interface PipelineResult {
  ok: boolean;
  clarificationRequired: boolean;
  clarificationQuestion: string | null;
  intent: AppIntent | null;
  dataSchema: DataSchema | null;
  appSpec: AppSpec | null;
  stages: StageReport[];
  totalCostUsd: number;
  totalLatencyMs: number;
}

export type PipelineEvent =
  | { type: "stage_start"; stage: StageName; timestamp: string }
  | {
      type: "stage_complete";
      stage: StageName;
      timestamp: string;
      telemetry: StageTelemetry;
      repairLog: RepairLogEntry[];
      partial: unknown;
    }
  | {
      type: "stage_failed";
      stage: StageName;
      timestamp: string;
      errors: ValidationError[];
      repairLog: RepairLogEntry[];
    }
  | { type: "clarification_required"; timestamp: string; question: string }
  | { type: "generation_complete"; timestamp: string; result: PipelineResult };

export interface RunPipelineOptions {
  gateway?: LlmGateway;
  onEvent?: (event: PipelineEvent) => void;
}

const now = (): string => new Date().toISOString();

function reportOf<T>(o: StageOutcome<T>): StageReport {
  return { stage: o.stage, ok: o.ok, errors: o.errors, repairLog: o.repairLog, telemetry: o.telemetry };
}

/**
 * Run the full Intent -> Schema -> AppSpec pipeline. Emits events as it goes
 * (for SSE) and always finishes with a `generation_complete` event.
 */
export async function runPipeline(prompt: string, opts: RunPipelineOptions = {}): Promise<PipelineResult> {
  const gateway = opts.gateway ?? defaultGateway;
  const emit = opts.onEvent ?? (() => {});
  const stages: StageReport[] = [];

  const result: PipelineResult = {
    ok: false,
    clarificationRequired: false,
    clarificationQuestion: null,
    intent: null,
    dataSchema: null,
    appSpec: null,
    stages,
    totalCostUsd: 0,
    totalLatencyMs: 0,
  };

  const finish = (ok: boolean): PipelineResult => {
    result.ok = ok;
    result.totalCostUsd = stages.reduce((s, r) => s + r.telemetry.costUsd, 0);
    result.totalLatencyMs = stages.reduce((s, r) => s + r.telemetry.latencyMs, 0);
    emit({ type: "generation_complete", timestamp: now(), result });
    return result;
  };

  // --- Stage 1: Intent ---
  emit({ type: "stage_start", stage: "intent", timestamp: now() });
  const intentOut = await runIntentStage(prompt, gateway);
  stages.push(reportOf(intentOut));
  if (!intentOut.ok || !intentOut.data) {
    emit({ type: "stage_failed", stage: "intent", timestamp: now(), errors: intentOut.errors, repairLog: intentOut.repairLog });
    return finish(false);
  }
  result.intent = intentOut.data;
  emit({
    type: "stage_complete",
    stage: "intent",
    timestamp: now(),
    telemetry: intentOut.telemetry,
    repairLog: intentOut.repairLog,
    partial: intentOut.data,
  });

  // Clarification halt — stop before Stage 2 and surface one question.
  if (intentOut.data.clarification_required) {
    result.clarificationRequired = true;
    result.clarificationQuestion = intentOut.data.clarification_question;
    emit({
      type: "clarification_required",
      timestamp: now(),
      question: intentOut.data.clarification_question ?? "Could you clarify what you want to build?",
    });
    return finish(false);
  }

  // --- Stage 2: Schema ---
  emit({ type: "stage_start", stage: "schema", timestamp: now() });
  const schemaOut = await runSchemaStage(intentOut.data, gateway);
  stages.push(reportOf(schemaOut));
  if (!schemaOut.ok || !schemaOut.data) {
    emit({ type: "stage_failed", stage: "schema", timestamp: now(), errors: schemaOut.errors, repairLog: schemaOut.repairLog });
    return finish(false);
  }
  result.dataSchema = schemaOut.data;
  emit({
    type: "stage_complete",
    stage: "schema",
    timestamp: now(),
    telemetry: schemaOut.telemetry,
    repairLog: schemaOut.repairLog,
    partial: schemaOut.data,
  });

  // --- Stage 3: AppSpec ---
  emit({ type: "stage_start", stage: "appspec", timestamp: now() });
  const specOut = await runAppSpecStage(schemaOut.data, intentOut.data.integrations_requested, intentOut.data.businessRules, gateway);
  if (!specOut.ok || !specOut.data) {
    stages.push(reportOf(specOut));
    emit({ type: "stage_failed", stage: "appspec", timestamp: now(), errors: specOut.errors, repairLog: specOut.repairLog });
    return finish(false);
  }

  // Deterministic workflowStub coverage for requested integrations.
  const coverage = ensureWorkflowCoverage(
    specOut.data,
    intentOut.data.integrations_requested,
    intentOut.data.businessRules,
    schemaOut.data,
    integrationRegistry,
  );
  const repairLog = [...specOut.repairLog, ...coverage.log];
  result.appSpec = coverage.appSpec;
  stages.push({ stage: "appspec", ok: true, errors: [], repairLog, telemetry: specOut.telemetry });
  emit({
    type: "stage_complete",
    stage: "appspec",
    timestamp: now(),
    telemetry: specOut.telemetry,
    repairLog,
    partial: coverage.appSpec,
  });

  return finish(true);
}
