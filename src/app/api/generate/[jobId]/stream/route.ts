import { jobStore } from "@/lib/jobs";
import type { PipelineEvent } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/generate/:jobId/stream — Server-Sent Events.
 * Replays all buffered events on connect (so reconnects see full history), then
 * streams new ones until `generation_complete`, at which point the stream closes.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await ctx.params;
  const job = jobStore.get(jobId);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: PipelineEvent): void => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      };
      const close = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Replay buffered history synchronously (no await => no missed events).
      for (const event of job.events) send(event);
      if (job.done) {
        close();
        return;
      }

      const unsubscribe = jobStore.subscribe(jobId, (event) => {
        send(event);
        if (event.type === "generation_complete") {
          unsubscribe();
          close();
        }
      });

      // Stop streaming if the client disconnects.
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
