"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JobStatusResponse } from "@/lib/jobs";
import type { Integration } from "@/lib/integrations";
import type { PipelineEvent } from "@/lib/pipeline";
import type { RunsOverview } from "@/lib/runs";
import { downloadJSON, downloadPDF } from "@/lib/export";
import {
  Card,
  StageProgress,
  OverviewPanel,
  PromptUnderstandingPanel,
  EntitiesPanel,
  PagesApisPanel,
  WorkflowsPanel,
  RequirementCoveragePanel,
  GenerationHealthPanel,
  CostPanel,
  RegistryPanel,
  HistoryPanel,
  type StageView,
} from "@/components/panels";

const STAGES_BASE: { name: string; label: string }[] = [
  { name: "intent", label: "Intent Extraction" },
  { name: "schema", label: "Schema Generation" },
  { name: "appspec", label: "App Spec Generation" },
];

const EXAMPLES = [
  "Build a CRM for a real estate agency. Agents manage leads, properties, and deals. Admin sees analytics. WhatsApp notifications when a deal closes.",
  "Task manager for an engineering team. Tasks have due dates, assignees, priorities, and status. Team lead gets a Slack message when a task is overdue.",
  "An app.",
];

function freshStages(): StageView[] {
  return STAGES_BASE.map((s) => ({ name: s.name, label: s.label, status: "pending" }));
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageView[]>(freshStages());
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [overview, setOverview] = useState<RunsOverview | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const loadOverview = useCallback(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d: RunsOverview) => setOverview(d))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((d: { integrations: Integration[] }) => setIntegrations(d.integrations))
      .catch(() => undefined);
    loadOverview();
    return () => esRef.current?.close();
  }, [loadOverview]);

  const setStage = useCallback((name: string, patch: Partial<StageView>) => {
    setStages((prev) => prev.map((s) => (s.name === name ? { ...s, ...patch } : s)));
  }, []);

  // Load a past run from history back into the panels.
  const handleSelectRun = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/runs/${id}`);
      if (!r.ok) return;
      const json = (await r.json()) as JobStatusResponse;
      setStatus(json);
      setClarification(json.clarification.required ? json.clarification.question : null);
      setStages(
        STAGES_BASE.map((s) => {
          const st = json.cost.perStage.find((p) => p.stage === s.name);
          return st
            ? { name: s.name, label: s.label, status: "complete" as const, latencyMs: st.latencyMs }
            : { name: s.name, label: s.label, status: "pending" as const };
        }),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* ignore */
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || running) return;
    esRef.current?.close();
    setRunning(true);
    setStatus(null);
    setClarification(null);
    setStages(freshStages());

    let jobId: string;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? "failed to start job");
      jobId = data.jobId;
    } catch {
      setRunning(false);
      return;
    }

    const finish = async () => {
      esRef.current?.close();
      try {
        const r = await fetch(`/api/generate/${jobId}`);
        const json = (await r.json()) as JobStatusResponse;
        setStatus(json);
        if (json.clarification.required) setClarification(json.clarification.question);
      } catch {
        /* ignore */
      }
      setRunning(false);
      loadOverview();
    };

    const es = new EventSource(`/api/generate/${jobId}/stream`);
    esRef.current = es;

    const onEvent = (ev: MessageEvent<string>) => {
      const event = JSON.parse(ev.data) as PipelineEvent;
      switch (event.type) {
        case "stage_start":
          setStage(event.stage, { status: "running" });
          break;
        case "stage_complete":
          setStage(event.stage, { status: "complete", latencyMs: event.telemetry.latencyMs });
          break;
        case "stage_failed":
          setStage(event.stage, { status: "failed" });
          break;
        case "generation_complete":
          void finish();
          break;
        default:
          break;
      }
    };

    for (const type of ["stage_start", "stage_complete", "stage_failed", "generation_complete"]) {
      es.addEventListener(type, onEvent as EventListener);
    }
    es.onerror = () => void finish();
  }, [prompt, running, setStage, loadOverview]);

  const intent = status?.intent ?? null;
  const appSpec = status?.appSpec ?? null;
  const dataSchema = status?.dataSchema ?? null;
  const showOutput = status !== null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-[12px]">
          <Image src="/logo.png" alt="AppSpeX Logo" width={28} height={28} className="object-contain" priority />
          <h1 className="text-[32px] font-bold leading-none text-white">AppSpeX</h1>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Describe an app in plain English → a validated, machine-readable AppSpec.
        </p>
      </header>

      <div className="space-y-6">
        <Card title="Prompt">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Build a CRM for a real estate agency…"
            rows={4}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-400/50"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleGenerate()}
              disabled={running || !prompt.trim()}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? "Generating…" : "Generate"}
            </button>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setPrompt(ex)}
                disabled={running}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
              >
                Example {i + 1}
              </button>
            ))}
          </div>
        </Card>

        {(running || showOutput) && (
          <Card title="Pipeline" subtitle="Live stage progress from the SSE stream">
            <StageProgress stages={stages} />
            {clarification ? (
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                <span className="font-semibold">Clarification needed:</span> {clarification}
              </div>
            ) : null}
          </Card>
        )}

        {showOutput && appSpec && dataSchema ? (
          <Card title="App Overview">
            <OverviewPanel appSpec={appSpec} dataSchema={dataSchema} repairLog={status.repairLog} />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => downloadJSON(status)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
              >
                ↓ Download JSON
              </button>
              <button
                onClick={() => downloadPDF(status)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
              >
                ↓ Download PDF
              </button>
            </div>
          </Card>
        ) : null}

        {showOutput && intent ? (
          <Card title="Prompt Understanding">
            <PromptUnderstandingPanel intent={intent} />
          </Card>
        ) : null}

        {showOutput && intent && appSpec && dataSchema ? (
          <Card title="Requirement Coverage">
            <RequirementCoveragePanel intent={intent} appSpec={appSpec} dataSchema={dataSchema} />
          </Card>
        ) : null}

        {showOutput && dataSchema ? (
          <Card title="Entities & Fields">
            <EntitiesPanel dataSchema={dataSchema} />
          </Card>
        ) : null}

        {showOutput && appSpec ? (
          <>
            <Card title="Pages & API Endpoints">
              <PagesApisPanel appSpec={appSpec} />
            </Card>
            <Card title="Integrations & Workflows">
              <WorkflowsPanel appSpec={appSpec} />
            </Card>
          </>
        ) : null}

        {showOutput && status ? (
          <>
            <Card title="Generation Health">
              <GenerationHealthPanel repairLog={status.repairLog} errors={status.errors} />
            </Card>
            <Card title="Cost & Latency">
              <CostPanel cost={status.cost} />
            </Card>
          </>
        ) : null}

        <Card
          title="Run History & Spend"
          subtitle="Every run is persisted — click one to reload it"
        >
          <HistoryPanel overview={overview} onSelect={handleSelectRun} />
        </Card>

        <Card title="Integration Registry" subtitle={`${integrations.length} integrations supported`}>
          <RegistryPanel integrations={integrations} />
        </Card>
      </div>
    </main>
  );
}
