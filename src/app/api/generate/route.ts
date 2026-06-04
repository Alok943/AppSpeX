import { z } from "zod";
import { startJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ prompt: z.string().min(1, "prompt is required") });

/** POST /api/generate — start a generation job. Returns { jobId }. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const job = startJob(parsed.data.prompt);
  return Response.json({ jobId: job.id }, { status: 202 });
}
