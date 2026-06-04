import { randomUUID } from "node:crypto";
import type { PipelineEvent, PipelineResult } from "@/lib/pipeline";
import type { Job, JobSubscriber } from "@/lib/jobs/types";

/**
 * In-memory job store. Each job buffers its full event stream so the SSE
 * endpoint can replay everything on reconnect. Status is derived from the
 * stream (a `generation_complete` event resolves the job).
 *
 * In-memory is a deliberate trial-scope cut: it requires a single long-running
 * Node process (Railway/Render), not serverless. Documented in the README.
 */
class JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly subscribers = new Map<string, Set<JobSubscriber>>();

  create(prompt: string): Job {
    const id = randomUUID();
    const job: Job = {
      id,
      prompt,
      status: "running",
      events: [],
      result: null,
      createdAt: new Date().toISOString(),
      done: false,
    };
    this.jobs.set(id, job);
    this.subscribers.set(id, new Set());
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  append(id: string, event: PipelineEvent): void {
    const job = this.jobs.get(id);
    if (!job || job.done) return;

    job.events.push(event);
    if (event.type === "generation_complete") {
      job.result = event.result;
      job.done = true;
      job.status = event.result.ok
        ? "completed"
        : event.result.clarificationRequired
          ? "needs_clarification"
          : "failed";
    }

    const subs = this.subscribers.get(id);
    if (subs) for (const fn of subs) fn(event);
  }

  /** Fail-safe: resolve a job that threw before emitting generation_complete. */
  markFailed(id: string, message: string): void {
    const job = this.jobs.get(id);
    if (!job || job.done) return;
    const result: PipelineResult = {
      ok: false,
      clarificationRequired: false,
      clarificationQuestion: null,
      intent: null,
      dataSchema: null,
      appSpec: null,
      stages: [],
      totalCostUsd: 0,
      totalLatencyMs: 0,
    };
    this.append(id, { type: "generation_complete", timestamp: new Date().toISOString(), result });
    // Record the underlying error message on the job for the status endpoint.
    job.status = "failed";
    void message;
  }

  /** Subscribe to FUTURE events. Callers replay `job.events` first (synchronously). */
  subscribe(id: string, fn: JobSubscriber): () => void {
    let set = this.subscribers.get(id);
    if (!set) {
      set = new Set();
      this.subscribers.set(id, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }
}

// Survive Next.js dev hot-reloads by stashing the singleton on globalThis.
const globalRef = globalThis as unknown as { __oneAtlasJobStore?: JobStore };
export const jobStore: JobStore = globalRef.__oneAtlasJobStore ?? (globalRef.__oneAtlasJobStore = new JobStore());
