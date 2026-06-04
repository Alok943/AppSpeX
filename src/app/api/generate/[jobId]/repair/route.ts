import { z } from "zod";
import { jobStore } from "@/lib/jobs";
import { validateIntent, validateDataSchema, validateAppSpec, type ValidationError } from "@/lib/validation";
import { fieldRepair, repairDataSchemaConsistency, repairAppSpecConsistency, type RepairLogEntry } from "@/lib/repair";
import { AppIntentSchema, AppSpecSchema, DataSchema } from "@/lib/schemas";
import { integrationRegistry } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  stage: z.enum(["intent", "schema", "appspec"]),
  errorHint: z.string().optional(),
  /** Optional payload to repair directly (for injecting malformed output). */
  payload: z.unknown().optional(),
});

interface RepairPassResult {
  beforeErrors: ValidationError[];
  repairLog: RepairLogEntry[];
  afterErrors: ValidationError[];
  repaired: unknown;
}

function repairStage(stage: string, input: unknown, dataSchema: DataSchema): RepairPassResult {
  const repairLog: RepairLogEntry[] = [];

  if (stage === "intent") {
    const beforeErrors = validateIntent(input).result.errors;
    const fr = fieldRepair(input, AppIntentSchema);
    repairLog.push(...fr.log);
    return { beforeErrors, repairLog, afterErrors: fr.data ? [] : fr.unresolved, repaired: fr.data };
  }

  if (stage === "schema") {
    const beforeErrors = validateDataSchema(input).result.errors;
    const fr = fieldRepair(input, DataSchema);
    repairLog.push(...fr.log);
    if (!fr.data) {
      return { beforeErrors, repairLog, afterErrors: fr.unresolved, repaired: null };
    }
    const cr = repairDataSchemaConsistency(fr.data);
    repairLog.push(...cr.log);
    return {
      beforeErrors,
      repairLog,
      afterErrors: validateDataSchema(cr.data).result.errors,
      repaired: cr.data,
    };
  }

  // appspec
  const beforeErrors = validateAppSpec(input, dataSchema, integrationRegistry).result.errors;
  const fr = fieldRepair(input, AppSpecSchema);
  repairLog.push(...fr.log);
  if (!fr.data) {
    return { beforeErrors, repairLog, afterErrors: fr.unresolved, repaired: null };
  }
  const cr = repairAppSpecConsistency(fr.data, dataSchema, integrationRegistry);
  repairLog.push(...cr.log);
  return {
    beforeErrors,
    repairLog,
    afterErrors: validateAppSpec(cr.data, dataSchema, integrationRegistry).result.errors,
    repaired: cr.data,
  };
}

/** POST /api/generate/:jobId/repair — run a repair pass on a stage output. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await ctx.params;
  const job = jobStore.get(jobId);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "body must be { stage: 'intent'|'schema'|'appspec', errorHint?, payload? }" }, { status: 400 });
  }
  const { stage, payload } = parsed.data;

  // Repair the provided payload, or fall back to the job's stored stage output.
  const stored =
    stage === "intent" ? job.result?.intent : stage === "schema" ? job.result?.dataSchema : job.result?.appSpec;
  const input = payload !== undefined ? payload : stored;
  if (input === undefined || input === null) {
    return Response.json(
      { error: `no stored output for stage "${stage}"; provide a payload to repair` },
      { status: 400 },
    );
  }

  const dataSchema: DataSchema = job.result?.dataSchema ?? { entities: [] };
  const result = repairStage(stage, input, dataSchema);
  return Response.json({ jobId, stage, ...result });
}
