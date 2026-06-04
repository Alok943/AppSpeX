import type { PipelineEvent, PipelineResult } from "@/lib/pipeline";

export type JobStatus = "running" | "completed" | "failed" | "needs_clarification";

export interface Job {
  id: string;
  prompt: string;
  status: JobStatus;
  /** Full event history, for SSE replay on reconnect. */
  events: PipelineEvent[];
  result: PipelineResult | null;
  createdAt: string;
  /** True once the job has resolved (success or failure). */
  done: boolean;
}

export type JobSubscriber = (event: PipelineEvent) => void;
