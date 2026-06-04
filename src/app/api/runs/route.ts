import { runStore } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/runs — cumulative cost totals + newest-first run history. */
export async function GET(): Promise<Response> {
  return Response.json(await runStore.overview());
}
