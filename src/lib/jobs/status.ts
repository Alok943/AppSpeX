import type { Job, JobStatus } from "@/lib/jobs/types";
import type { AppIntent, DataSchema, AppSpec } from "@/lib/schemas";
import type { ValidationError } from "@/lib/validation";
import type { RepairLogEntry } from "@/lib/repair";
import type { StageName } from "@/lib/gateway";

export interface StageCost {
  stage: StageName;
  model: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
}

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  prompt: string;
  createdAt: string;
  clarification: { required: boolean; question: string | null };
  intent: AppIntent | null;
  dataSchema: DataSchema | null;
  appSpec: AppSpec | null;
  errors: ValidationError[];
  repairLog: { stage: StageName; entries: RepairLogEntry[] }[];
  cost: {
    totalUsd: number;
    totalLatencyMs: number;
    perStage: StageCost[];
    perProvider: Record<string, number>;
  };
}

/** Shape a job into the public status response. */
export function toStatusResponse(job: Job): JobStatusResponse {
  const result = job.result;
  const stages = result?.stages ?? [];

  const perStage: StageCost[] = stages.map((s) => ({
    stage: s.stage,
    model: s.telemetry.modelId,
    calls: s.telemetry.calls,
    tokensIn: s.telemetry.tokensIn,
    tokensOut: s.telemetry.tokensOut,
    costUsd: s.telemetry.costUsd,
    latencyMs: s.telemetry.latencyMs,
  }));

  const perProvider: Record<string, number> = {};
  for (const s of stages) {
    perProvider[s.telemetry.provider] = (perProvider[s.telemetry.provider] ?? 0) + s.telemetry.costUsd;
  }

  // Errors come from whichever stage failed.
  const errors = stages.flatMap((s) => s.errors);

  return {
    jobId: job.id,
    status: job.status,
    prompt: job.prompt,
    createdAt: job.createdAt,
    clarification: {
      required: result?.clarificationRequired ?? false,
      question: result?.clarificationQuestion ?? null,
    },
    intent: result?.intent ?? null,
    dataSchema: result?.dataSchema ?? null,
    appSpec: result?.appSpec ?? null,
    errors,
    repairLog: stages.map((s) => ({ stage: s.stage, entries: s.repairLog })),
    cost: {
      totalUsd: result?.totalCostUsd ?? 0,
      totalLatencyMs: result?.totalLatencyMs ?? 0,
      perStage,
      perProvider,
    },
  };
}
