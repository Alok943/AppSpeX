import type { LlmGateway } from "@/lib/gateway";
import { runPipeline } from "@/lib/pipeline";
import { jobStore } from "@/lib/jobs/store";
import { toStatusResponse } from "@/lib/jobs/status";
import type { Job } from "@/lib/jobs/types";
import { runStore } from "@/lib/runs";

/**
 * Create a job and run the pipeline as a fire-and-forget task, streaming each
 * event into the store. Returns immediately with the job (so the POST handler
 * can return a jobId). On completion the run is persisted to the run history.
 * Requires a long-running process to finish.
 */
export function startJob(prompt: string, gateway?: LlmGateway): Job {
  const job = jobStore.create(prompt);
  void runPipeline(prompt, {
    gateway,
    onEvent: (event) => {
      jobStore.append(job.id, event);
      if (event.type === "generation_complete") {
        const finished = jobStore.get(job.id);
        if (finished) void runStore.save(toStatusResponse(finished));
      }
    },
  }).catch((err: unknown) => {
    jobStore.markFailed(job.id, err instanceof Error ? err.message : String(err));
    const finished = jobStore.get(job.id);
    if (finished) void runStore.save(toStatusResponse(finished));
  });
  return job;
}
