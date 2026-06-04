import { promises as fs } from "node:fs";
import path from "node:path";
import type { JobStatusResponse } from "@/lib/jobs";
import type { RunSummary, RunsOverview } from "@/lib/runs/types";

/**
 * Disk-backed history of completed runs. Each run is written in full to
 * `.data/runs/<id>.json`, and a compact summary is appended to a single index
 * file used for the history list and cumulative cost totals. No external DB —
 * survives restarts via the local filesystem (use a persistent volume in prod).
 */
export class RunStore {
  private readonly runsDir: string;
  private readonly indexPath: string;
  private index: RunSummary[] | null = null;
  // Serialize writes so concurrent completions don't clobber the index.
  private writeChain: Promise<void> = Promise.resolve();

  constructor(baseDir: string = path.join(process.cwd(), ".data")) {
    this.runsDir = path.join(baseDir, "runs");
    this.indexPath = path.join(baseDir, "runs-index.json");
  }

  private async loadIndex(): Promise<RunSummary[]> {
    if (this.index) return this.index;
    try {
      this.index = JSON.parse(await fs.readFile(this.indexPath, "utf8")) as RunSummary[];
    } catch {
      this.index = [];
    }
    return this.index;
  }

  /** Persist a completed run (full record + index summary). */
  save(run: JobStatusResponse): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.doSave(run)).catch(() => undefined);
    return this.writeChain;
  }

  private async doSave(run: JobStatusResponse): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
    await fs.writeFile(
      path.join(this.runsDir, `${run.jobId}.json`),
      JSON.stringify(run, null, 2),
      "utf8",
    );

    const index = await this.loadIndex();
    const summary: RunSummary = {
      id: run.jobId,
      prompt: run.prompt.slice(0, 200),
      status: run.status,
      ok: run.status === "completed",
      appType: run.intent?.appType ?? null,
      createdAt: run.createdAt,
      completedAt: new Date().toISOString(),
      totalCostUsd: run.cost.totalUsd,
      totalLatencyMs: run.cost.totalLatencyMs,
      clarificationRequired: run.clarification.required,
    };
    this.index = [summary, ...index.filter((r) => r.id !== summary.id)];
    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), "utf8");
  }

  /** Cumulative totals + newest-first history. */
  async overview(): Promise<RunsOverview> {
    const index = await this.loadIndex();
    return {
      totals: {
        runCount: index.length,
        totalCostUsd: index.reduce((s, r) => s + r.totalCostUsd, 0),
        totalLatencyMs: index.reduce((s, r) => s + r.totalLatencyMs, 0),
      },
      history: index,
    };
  }

  /** Full stored record for one past run. */
  async getRun(id: string): Promise<JobStatusResponse | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.runsDir, `${id}.json`), "utf8")) as JobStatusResponse;
    } catch {
      return null;
    }
  }
}

// Survive Next dev hot-reloads.
const globalRef = globalThis as unknown as { __oneAtlasRunStore?: RunStore };
export const runStore: RunStore = globalRef.__oneAtlasRunStore ?? (globalRef.__oneAtlasRunStore = new RunStore());
