import type { JobStatus } from "@/lib/jobs";

/** Compact record of one run, kept in the index for history + totals. */
export interface RunSummary {
  id: string;
  prompt: string;
  status: JobStatus;
  ok: boolean;
  appType: string | null;
  createdAt: string;
  completedAt: string;
  totalCostUsd: number;
  totalLatencyMs: number;
  clarificationRequired: boolean;
}

export interface RunTotals {
  runCount: number;
  totalCostUsd: number;
  totalLatencyMs: number;
}

export interface RunsOverview {
  totals: RunTotals;
  history: RunSummary[];
}
