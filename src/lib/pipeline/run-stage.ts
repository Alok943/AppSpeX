import type { ZodType } from "zod";
import type { GatewayResponse, LlmGateway, ProviderId, StageName } from "@/lib/gateway";
import type { ValidationError } from "@/lib/validation";
import { structuralRepair, fieldRepair, type RepairLogEntry, type RepairResult } from "@/lib/repair";
import type { Prompt } from "@/lib/pipeline/prompts";

/** Aggregated cost/latency for a stage (a stage may make >1 model call). */
export interface StageTelemetry {
  modelId: string;
  provider: ProviderId;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  viaFallback: boolean;
  calls: number;
}

export interface StageOutcome<T> {
  stage: StageName;
  ok: boolean;
  data: T | null;
  errors: ValidationError[];
  repairLog: RepairLogEntry[];
  telemetry: StageTelemetry;
  raw: string;
}

export interface RunStageOptions<T> {
  stage: StageName;
  schema: ZodType<T>;
  gateway: LlmGateway;
  /** Build the prompt; `note` is set on a correction re-prompt. */
  buildPrompt: (note?: string) => Prompt;
  /** Cross-layer (semantic) errors for shape-valid data. Omit if none. */
  semanticErrors?: (data: T) => ValidationError[];
  /** Deterministic consistency repair for semantic errors. Omit if none. */
  consistencyRepair?: (data: T) => RepairResult<T>;
}

function zeroTelemetry(): StageTelemetry {
  return {
    modelId: "none",
    provider: "groq",
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: 0,
    viaFallback: false,
    calls: 0,
  };
}

function applyCall(t: StageTelemetry, resp: GatewayResponse): void {
  if (t.calls === 0) {
    t.modelId = resp.modelId;
    t.provider = resp.provider;
  }
  t.tokensIn += resp.tokensIn;
  t.tokensOut += resp.tokensOut;
  t.costUsd += resp.costUsd;
  t.latencyMs += resp.latencyMs;
  t.viaFallback = t.viaFallback || resp.viaFallback;
  t.calls += 1;
}

function noteFromErrors(errors: ValidationError[]): string {
  return errors.map((e) => `- ${e.path}: ${e.message}`).join("\n");
}

/** Parse text; if it isn't JSON, try a deterministic structural repair. */
function parseText(raw: string, repairLog: RepairLogEntry[]): { ok: boolean; value: unknown } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    const s = structuralRepair(raw);
    repairLog.push(s.log);
    return { ok: s.ok, value: s.value };
  }
}

/** One shape pass: parse (+structural) then field-repair against the schema. */
function shapeOnce<T>(
  raw: string,
  schema: ZodType<T>,
  repairLog: RepairLogEntry[],
): { data: T | null; unresolved: ValidationError[] } {
  const parsed = parseText(raw, repairLog);
  if (!parsed.ok) {
    return {
      data: null,
      unresolved: [
        { code: "SCHEMA_SHAPE", path: "(root)", message: "model output was not valid JSON and could not be repaired" },
      ],
    };
  }
  const fr = fieldRepair(parsed.value, schema);
  repairLog.push(...fr.log);
  return { data: fr.data, unresolved: fr.data ? [] : fr.unresolved };
}

/**
 * Run one pipeline stage end-to-end. Deterministic repairs run first; a bounded,
 * targeted re-prompt (carrying the exact errors) is the only escalation — never
 * a blind retry. At most three model calls: initial + shape correction +
 * semantic correction. Gateway failures are caught and returned as a clean
 * failed outcome so the pipeline always resolves.
 */
export async function runStage<T>(opts: RunStageOptions<T>): Promise<StageOutcome<T>> {
  const { stage, schema, gateway } = opts;
  const repairLog: RepairLogEntry[] = [];
  const telemetry = zeroTelemetry();
  let raw = "";

  const callGateway = async (note?: string): Promise<void> => {
    const prompt = opts.buildPrompt(note);
    const resp = await gateway.generate(stage, { system: prompt.system, user: prompt.user, jsonMode: true });
    applyCall(telemetry, resp);
    raw = resp.text;
  };

  try {
    // --- attempt 1 ---
    await callGateway();
    let shaped = shapeOnce(raw, schema, repairLog);

    // --- shape correction re-prompt (e.g. a bad enum field can't be guessed) ---
    if (!shaped.data && shaped.unresolved.length > 0) {
      await callGateway(noteFromErrors(shaped.unresolved));
      shaped = shapeOnce(raw, schema, repairLog);
    }

    if (!shaped.data) {
      return { stage, ok: false, data: null, errors: shaped.unresolved, repairLog, telemetry, raw };
    }
    let data: T = shaped.data;

    // --- semantic validation + deterministic consistency repair ---
    if (opts.semanticErrors) {
      let errs = opts.semanticErrors(data);

      if (errs.length > 0 && opts.consistencyRepair) {
        const cr = opts.consistencyRepair(data);
        repairLog.push(...cr.log);
        data = cr.data;
        errs = opts.semanticErrors(data);
      }

      // --- semantic correction re-prompt (last resort) ---
      if (errs.length > 0) {
        await callGateway(noteFromErrors(errs));
        const reshaped = shapeOnce(raw, schema, repairLog);
        if (reshaped.data) {
          data = reshaped.data;
          if (opts.consistencyRepair) {
            const cr2 = opts.consistencyRepair(data);
            repairLog.push(...cr2.log);
            data = cr2.data;
          }
          errs = opts.semanticErrors(data);
        }
        if (errs.length > 0) {
          return { stage, ok: false, data, errors: errs, repairLog, telemetry, raw };
        }
      }
    }

    return { stage, ok: true, data, errors: [], repairLog, telemetry, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      stage,
      ok: false,
      data: null,
      errors: [{ code: "SCHEMA_SHAPE", path: "(gateway)", message: `generation failed: ${message}` }],
      repairLog,
      telemetry,
      raw,
    };
  }
}
