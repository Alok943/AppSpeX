import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RunStore } from "@/lib/runs/store";
import type { JobStatusResponse } from "@/lib/jobs";

function fakeRun(id: string, cost: number): JobStatusResponse {
  return {
    jobId: id,
    status: "completed",
    prompt: "Build a CRM",
    createdAt: new Date().toISOString(),
    clarification: { required: false, question: null },
    intent: {
      appName: "X",
      appType: "crm",
      features: [],
      entities: [],
      integrations_requested: [],
      assumptions: [],
      clarification_required: false,
      clarification_question: null,
    },
    dataSchema: null,
    appSpec: null,
    errors: [],
    repairLog: [],
    cost: {
      totalUsd: cost,
      totalLatencyMs: 100,
      perStage: [
        { stage: "intent", model: "m", calls: 1, tokensIn: 1, tokensOut: 1, costUsd: cost, latencyMs: 100 },
      ],
      perProvider: { groq: cost },
    },
  };
}

describe("RunStore", () => {
  let dir: string;
  let store: RunStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "oneatlas-runs-"));
    store = new RunStore(dir);
  });

  it("persists runs and aggregates cost totals (newest first)", async () => {
    await store.save(fakeRun("a", 0.001));
    await store.save(fakeRun("b", 0.002));
    const ov = await store.overview();
    expect(ov.totals.runCount).toBe(2);
    expect(ov.totals.totalCostUsd).toBeCloseTo(0.003, 9);
    expect(ov.history[0]?.id).toBe("b");
  });

  it("returns a full stored run by id, or null when missing", async () => {
    await store.save(fakeRun("a", 0.001));
    expect((await store.getRun("a"))?.jobId).toBe("a");
    expect(await store.getRun("missing")).toBeNull();
  });

  it("survives a fresh store instance by reading from disk", async () => {
    await store.save(fakeRun("a", 0.001));
    const store2 = new RunStore(dir);
    const ov = await store2.overview();
    expect(ov.totals.runCount).toBe(1);
  });
});
