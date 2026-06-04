import { jobStore, toStatusResponse } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/generate/:jobId — full job status, AppSpec, repair log, cost, latency. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await ctx.params;
  const job = jobStore.get(jobId);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  return Response.json(toStatusResponse(job));
}
