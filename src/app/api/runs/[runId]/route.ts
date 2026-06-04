import { runStore } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/runs/:runId — the full stored record for one past run. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await ctx.params;
  const run = await runStore.getRun(runId);
  if (!run) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }
  return Response.json(run);
}
