import { integrationRegistry } from "@/lib/integrations";

export const runtime = "nodejs";

/** GET /api/integrations — the full integration registry (triggers + actions). */
export async function GET(): Promise<Response> {
  return Response.json({ integrations: integrationRegistry.list() });
}
