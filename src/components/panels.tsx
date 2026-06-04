import type { ReactNode } from "react";
import type { AppSpec, DataSchema, AppIntent } from "@/lib/schemas";
import type { ValidationError } from "@/lib/validation";
import type { Integration } from "@/lib/integrations";
import type { JobStatusResponse, JobStatus } from "@/lib/jobs";
import type { RunsOverview } from "@/lib/runs";

// --- shared bits ------------------------------------------------------------

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-5 shadow-xl shadow-black/20">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-indigo-200/90">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export type StageStatus = "pending" | "running" | "complete" | "failed";

export interface StageView {
  name: string;
  label: string;
  status: StageStatus;
  latencyMs?: number;
}

const STAGE_DOT: Record<StageStatus, string> = {
  pending: "bg-slate-600",
  running: "bg-amber-400 animate-pulse",
  complete: "bg-emerald-400",
  failed: "bg-rose-500",
};

const STAGE_TEXT: Record<StageStatus, string> = {
  pending: "text-slate-400",
  running: "text-amber-200",
  complete: "text-emerald-200",
  failed: "text-rose-200",
};

export function StageProgress({ stages }: { stages: StageView[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stages.map((s) => (
        <div key={s.name} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STAGE_DOT[s.status]}`} />
              <span className="text-sm font-medium text-slate-100">{s.label}</span>
            </span>
            <span className={`text-xs font-medium capitalize ${STAGE_TEXT[s.status]}`}>{s.status}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {s.latencyMs !== undefined ? `${s.latencyMs} ms` : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- AppSpec output ---------------------------------------------------------

export function OverviewPanel({ appSpec, dataSchema, repairLog }: { appSpec: AppSpec | null; dataSchema: DataSchema | null; repairLog: JobStatusResponse["repairLog"] }) {
  if (!appSpec || !dataSchema) return null;
  const totalRepairs = repairLog.reduce((n, s) => n + s.entries.length, 0);
  return (
    <div className="flex flex-wrap gap-8">
      <Metric label="Entities" value={`${dataSchema.entities.length}`} />
      <Metric label="Pages" value={`${appSpec.pages.length}`} />
      <Metric label="APIs" value={`${appSpec.apiEndpoints.length}`} />
      <Metric label="Integrations" value={`${appSpec.integrationHooks.length}`} />
      <Metric label="Repairs" value={`${totalRepairs}`} />
    </div>
  );
}

export function PromptUnderstandingPanel({ intent }: { intent: AppIntent | null }) {
  if (!intent) return <Empty label="No intent yet." />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Detected Features</h3>
        <ul className="list-inside list-disc text-sm text-slate-300 space-y-1">
          {intent.features.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Detected Entities</h3>
        <ul className="list-inside list-disc text-sm text-slate-300 space-y-1">
          {intent.entities.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Detected Integrations</h3>
        {intent.integrations_requested.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
          <ul className="list-inside list-disc text-sm text-emerald-300 space-y-1">
            {intent.integrations_requested.map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
        )}
      </div>
      {intent.businessRules && intent.businessRules.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Business Rules</h3>
          <ul className="list-inside list-disc text-sm text-sky-300 space-y-1">
            {intent.businessRules.map((rule, i) => <li key={i}>{rule}</li>)}
          </ul>
        </div>
      )}
      <div className="md:col-span-2">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Assumptions Made</h3>
        {intent.assumptions.length === 0 ? <p className="text-sm text-slate-500">None made.</p> : (
          <ul className="list-inside list-disc text-sm text-slate-400 space-y-1">
            {intent.assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Coverage ---------------------------------------------------------------

import { computeCoverage, type CoverageStatus } from "@/lib/coverage";

const STATUS_UI: Record<CoverageStatus, { icon: string; color: string }> = {
  ok: { icon: "✓", color: "text-emerald-400" },
  partial: { icon: "◐", color: "text-amber-400" },
  missing: { icon: "✗", color: "text-rose-400" },
};

export function RequirementCoveragePanel({
  intent,
  appSpec,
  dataSchema,
}: {
  intent: AppIntent | null;
  appSpec: AppSpec | null;
  dataSchema: DataSchema | null;
}) {
  if (!intent || !appSpec || !dataSchema) return null;

  const coverage = computeCoverage(intent, appSpec, dataSchema);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-8">
        <Metric label="Overall Coverage" value={`${coverage.overallPercent}%`} />
        <Metric label="Features" value={`${coverage.features.filter((x) => x.status === "ok").length}/${coverage.features.length}`} />
        <Metric label="Entities" value={`${coverage.entities.filter((x) => x.status === "ok").length}/${coverage.entities.length}`} />
        <Metric label="Integrations" value={`${coverage.integrations.filter((x) => x.status === "ok").length}/${coverage.integrations.length}`} />
        {coverage.businessRules.length > 0 && (
          <Metric label="Business Rules" value={`${coverage.businessRules.filter((x) => x.status === "ok").length}/${coverage.businessRules.length}`} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Features</h3>
          <ul className="space-y-1">
            {coverage.features.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className={STATUS_UI[x.status].color}>{STATUS_UI[x.status].icon}</span>
                <span className={x.status === "missing" ? "opacity-60" : ""}>{x.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Entities</h3>
          <ul className="space-y-1">
            {coverage.entities.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className={STATUS_UI[x.status].color}>{STATUS_UI[x.status].icon}</span>
                <span className={x.status === "missing" ? "opacity-60" : ""}>{x.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Integrations</h3>
          <ul className="space-y-1">
            {coverage.integrations.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className={STATUS_UI[x.status].color}>{STATUS_UI[x.status].icon}</span>
                <span className={x.status === "missing" ? "opacity-60" : ""}>{x.name}</span>
              </li>
            ))}
            {coverage.integrations.length === 0 && <li className="text-sm text-slate-500">None requested</li>}
          </ul>
        </div>
        {coverage.businessRules.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Business Rules</h3>
            <ul className="space-y-1">
              {coverage.businessRules.map((x, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className={STATUS_UI[x.status].color}>{STATUS_UI[x.status].icon}</span>
                  <span className={x.status === "missing" ? "opacity-60" : ""}>{x.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Entities ---------------------------------------------------------------

export function EntitiesPanel({ dataSchema }: { dataSchema: DataSchema | null }) {
  if (!dataSchema) return <Empty label="No schema yet." />;
  return (
    <div className="space-y-4">
      {dataSchema.entities.map((e) => (
        <div key={e.name} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-100">{e.name}</h3>
            <code className="text-xs text-indigo-300">{e.tableName}</code>
          </div>
          {e.description ? (
            <p className="mt-1 text-xs text-slate-400">{e.description}</p>
          ) : null}
          <ul className="mt-3 flex flex-wrap gap-2">
            {e.fields.map((f) => (
              <li
                key={f.name}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200"
              >
                <span className="font-medium">{f.name}</span>
                <span className="text-slate-400"> : {f.type}</span>
                {f.isPrimary ? <span className="ml-1 text-amber-300">PK</span> : null}
              </li>
            ))}
          </ul>
          {e.relations.length > 0 ? (
            <div className="mt-3 text-xs text-slate-400">
              {e.relations.map((r, i) => (
                <span key={i} className="mr-3">
                  <span className="text-sky-300">{r.type}</span> {r.target}{" "}
                  <span className="text-slate-500">({r.foreignKey})</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function PagesApisPanel({ appSpec }: { appSpec: AppSpec | null }) {
  if (!appSpec) return <Empty label="No AppSpec yet." />;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pages</h3>
        <Table head={["Name", "Route", "Layout", "Entity", "Components"]}>
          {appSpec.pages.map((p) => (
            <tr key={p.name} className="border-t border-white/5">
              <Td>{p.name}</Td>
              <Td mono>{p.route}</Td>
              <Td>{p.layout}</Td>
              <Td>{p.entity}</Td>
              <Td>{p.components.join(", ")}</Td>
            </tr>
          ))}
        </Table>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">API Endpoints</h3>
        <div className="space-y-3">
          {Array.from(new Set(appSpec.apiEndpoints.map((ep) => ep.entity))).map((entity) => {
            const endpoints = appSpec.apiEndpoints.filter((ep) => ep.entity === entity);
            return (
              <details key={entity} className="group rounded-xl border border-white/10 bg-black/20" open={endpoints.length < 5}>
                <summary className="flex cursor-pointer items-center justify-between p-3 text-sm font-medium text-slate-100 outline-none">
                  <span>{entity} APIs <span className="ml-2 text-xs text-slate-500">({endpoints.length})</span></span>
                  <span className="text-slate-500 transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div className="border-t border-white/5 p-3">
                  <Table head={["Method", "Path", "Auth", "Rate limit"]}>
                    {endpoints.map((ep, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <Td>
                          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-semibold text-indigo-200">
                            {ep.method}
                          </span>
                        </Td>
                        <Td mono>{ep.path}</Td>
                        <Td>{ep.authRequired ? "Yes" : "No"}</Td>
                        <Td>{ep.rateLimit ? "Yes" : "No"}</Td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function WorkflowsPanel({ appSpec }: { appSpec: AppSpec | null }) {
  if (!appSpec) return <Empty label="No AppSpec yet." />;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Integration Hooks</h3>
        {appSpec.integrationHooks.length === 0 ? (
          <p className="text-sm text-slate-500">None.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {appSpec.integrationHooks.map((h, i) => (
              <li key={i} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200">
                <span className="text-emerald-300">{h.integration}</span>
                <span className="text-slate-400"> · {h.action}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Workflow Stubs</h3>
        <div className="space-y-2">
          {appSpec.workflowStubs.map((w, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-100">{w.name}</div>
                <div className={`text-[10px] font-semibold uppercase ${w.source === "synthesized" ? "text-amber-400" : "text-emerald-400"}`}>
                  {w.source === "synthesized" ? "Synthesized Fallback" : "LLM Generated"}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                on <span className="text-sky-300">{w.trigger.entity}</span>.{w.trigger.event}
                {w.trigger.condition ? <span className="text-slate-500"> [{w.trigger.condition}]</span> : null} →{" "}
                <span className="text-emerald-300">{w.integration}</span>.{w.action}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- errors + repairs -------------------------------------------------------

const HEALTHY_REPAIRS = [
  "added tenantId",
  "added inverse",
  "missing array",
  "filled typed default"
];

const CONCERNING_REPAIRS = [
  "synthesized",
  "dropped",
  "removed",
  "generated fallback"
];

export function GenerationHealthPanel({
  repairLog,
  errors,
}: {
  repairLog: JobStatusResponse["repairLog"];
  errors: ValidationError[];
}) {
  const allEntries = repairLog.flatMap((stage) => stage.entries);
  const totalRepairs = allEntries.length;

  const healthy = allEntries.filter((e) => HEALTHY_REPAIRS.some((k) => e.detail.includes(k)));
  const concerning = allEntries.filter((e) => CONCERNING_REPAIRS.some((k) => e.detail.includes(k)));
  const other = allEntries.filter((e) => !healthy.includes(e) && !concerning.includes(e));

  return (
    <div className="space-y-6">
      {errors.length > 0 ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-200">
            Unresolved validation errors
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-rose-100">
            {errors.map((e, i) => (
              <li key={i}>
                <code className="text-rose-300">{e.code}</code> · {e.path}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {totalRepairs === 0 && errors.length === 0 ? (
        <p className="text-sm text-emerald-300">Perfect generation! No repairs or errors.</p>
      ) : null}

      {totalRepairs > 0 ? (
        <div className="space-y-4">
          {healthy.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Healthy Repairs ({healthy.length})
              </h3>
              <ul className="space-y-1">
                {healthy.map((entry, i) => (
                  <li key={i} className="text-xs text-slate-300">
                    <span className="text-emerald-400 mr-2">✓</span>
                    {entry.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {concerning.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                Concerning Repairs ({concerning.length})
              </h3>
              <ul className="space-y-1">
                {concerning.map((entry, i) => (
                  <li key={i} className="text-xs text-slate-300">
                    <span className="text-amber-400 mr-2">⚠</span>
                    {entry.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {other.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Other Repairs ({other.length})
              </h3>
              <ul className="space-y-1">
                {other.map((entry, i) => (
                  <li key={i} className="text-xs text-slate-300">
                    <span className="text-slate-500 mr-2">•</span>
                    {entry.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// --- cost -------------------------------------------------------------------

export function CostPanel({ cost }: { cost: JobStatusResponse["cost"] }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-6">
        <Metric label="Total cost" value={`$${cost.totalUsd.toFixed(6)}`} />
        <Metric label="Total latency" value={`${cost.totalLatencyMs} ms`} />
      </div>
      <Table head={["Stage", "Model", "Calls", "Tokens in", "Tokens out", "Cost", "Latency"]}>
        {cost.perStage.map((s) => (
          <tr key={s.stage} className="border-t border-white/5">
            <Td>{s.stage}</Td>
            <Td mono>{s.model}</Td>
            <Td>{s.calls}</Td>
            <Td>{s.tokensIn}</Td>
            <Td>{s.tokensOut}</Td>
            <Td>${s.costUsd.toFixed(6)}</Td>
            <Td>{s.latencyMs} ms</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// --- integration registry ---------------------------------------------------

export function RegistryPanel({ integrations }: { integrations: Integration[] }) {
  if (integrations.length === 0) return <Empty label="Loading registry…" />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {integrations.map((i) => (
        <div key={i.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">{i.displayName}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                i.implemented ? "bg-sky-500/20 text-sky-300" : "bg-slate-500/20 text-slate-300"
              }`}
            >
              {i.implemented ? "supported" : "stub"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            <code className="text-indigo-300">{i.id}</code> · {i.authType}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            actions: {i.actions.map((a) => a.id).join(", ") || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- run history + spend ----------------------------------------------------

const STATUS_PILL: Record<JobStatus, string> = {
  completed: "bg-emerald-500/20 text-emerald-200",
  failed: "bg-rose-500/20 text-rose-200",
  needs_clarification: "bg-amber-500/20 text-amber-200",
  running: "bg-slate-500/20 text-slate-300",
};

function StatusPill({ status }: { status: JobStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_PILL[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function HistoryPanel({
  overview,
  onSelect,
}: {
  overview: RunsOverview | null;
  onSelect: (id: string) => void;
}) {
  if (!overview) return <Empty label="Loading history…" />;
  const { totals, history } = overview;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-8">
        <Metric label="Total spent" value={`$${totals.totalCostUsd.toFixed(6)}`} />
        <Metric label="Runs" value={`${totals.runCount}`} />
        <Metric label="Total latency" value={`${(totals.totalLatencyMs / 1000).toFixed(1)} s`} />
      </div>
      {history.length === 0 ? (
        <Empty label="No runs yet — generate one above." />
      ) : (
        <Table head={["When", "Prompt", "Type", "Status", "Cost"]}>
          {history.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="cursor-pointer border-t border-white/5 transition hover:bg-white/5"
            >
              <Td>{new Date(r.completedAt).toLocaleString()}</Td>
              <Td>{r.prompt.length > 52 ? `${r.prompt.slice(0, 52)}…` : r.prompt}</Td>
              <Td>{r.appType ?? "—"}</Td>
              <Td>
                <StatusPill status={r.status} />
              </Td>
              <Td>${r.totalCostUsd.toFixed(6)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// --- small helpers ----------------------------------------------------------

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-slate-500">{label}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-200">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return <td className={`px-3 py-2 ${mono ? "font-mono text-xs text-slate-300" : ""}`}>{children}</td>;
}
