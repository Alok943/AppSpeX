import type { JobStatusResponse } from "@/lib/jobs";
import { jsPDF } from "jspdf";

// ── helpers ──────────────────────────────────────────────────────────────────

const REPORT_VERSION = "v0.4";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitiseFilename(prompt: string): string {
  return prompt
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40)
    .toLowerCase();
}

import { computeCoverage, type CoverageItem } from "./coverage";

const HEALTHY_REPAIRS = [
  "added tenantId",
  "added inverse",
  "missing array",
  "filled typed default",
];

const CONCERNING_REPAIRS = [
  "synthesized",
  "dropped",
  "removed",
  "generated fallback",
];

// ── Coverage computation (shared between UI & export) ────────────────────────

interface HealthSummary {
  healthy: string[];
  concerning: string[];
  other: string[];
}

function computeHealth(status: JobStatusResponse): HealthSummary {
  const allEntries = status.repairLog.flatMap((s) => s.entries);
  const healthy = allEntries
    .filter((e) => HEALTHY_REPAIRS.some((k) => e.detail.includes(k)))
    .map((e) => e.detail);
  const concerning = allEntries
    .filter((e) => CONCERNING_REPAIRS.some((k) => e.detail.includes(k)))
    .map((e) => e.detail);
  const healthySet = new Set(healthy);
  const concerningSet = new Set(concerning);
  const other = allEntries
    .filter((e) => !healthySet.has(e.detail) && !concerningSet.has(e.detail))
    .map((e) => e.detail);
  return { healthy, concerning, other };
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function downloadJSON(status: JobStatusResponse) {
  const coverage =
    status.intent && status.appSpec && status.dataSchema
      ? computeCoverage(status.intent, status.appSpec, status.dataSchema)
      : null;
  const health = computeHealth(status);

  const payload = {
    reportVersion: REPORT_VERSION,
    exportedAt: new Date().toISOString(),
    prompt: status.prompt,
    appType: status.intent?.appType ?? null,
    coverageSummary: coverage
      ? {
          entities: {
            ok: coverage.entities.filter((x) => x.status === "ok").length,
            partial: coverage.entities.filter((x) => x.status === "partial").length,
            missing: coverage.entities.filter((x) => x.status === "missing").length,
            total: coverage.entities.length
          },
          features: {
            ok: coverage.features.filter((x) => x.status === "ok").length,
            partial: coverage.features.filter((x) => x.status === "partial").length,
            missing: coverage.features.filter((x) => x.status === "missing").length,
            total: coverage.features.length
          },
          integrations: {
            ok: coverage.integrations.filter((x) => x.status === "ok").length,
            partial: coverage.integrations.filter((x) => x.status === "partial").length,
            missing: coverage.integrations.filter((x) => x.status === "missing").length,
            total: coverage.integrations.length
          },
          businessRules: {
            ok: coverage.businessRules.filter((x) => x.status === "ok").length,
            partial: coverage.businessRules.filter((x) => x.status === "partial").length,
            missing: coverage.businessRules.filter((x) => x.status === "missing").length,
            total: coverage.businessRules.length
          },
          overallCoverage: `${coverage.overallPercent}%`,
        }
      : null,
    generationHealth: {
      healthyRepairs: health.healthy,
      concerningRepairs: health.concerning,
      otherRepairs: health.other,
    },
    intent: status.intent,
    dataSchema: status.dataSchema,
    appSpec: status.appSpec,
    errors: status.errors,
    repairLog: status.repairLog,
    cost: status.cost,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `appspex_${sanitiseFilename(status.prompt)}.json`);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const PAGE_W = 210; // A4 mm
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 5;

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > 280) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function heading(doc: jsPDF, y: number, text: string, level: 1 | 2 | 3 = 2): number {
  const sizes = { 1: 16, 2: 12, 3: 10 } as const;
  y = ensureSpace(doc, y, 12);
  doc.setFontSize(sizes[level]);
  doc.setFont("helvetica", "bold");
  doc.text(text, MARGIN, y);
  y += LINE_H + 3;
  if (level <= 2) {
    doc.setDrawColor(180);
    doc.line(MARGIN, y - 2, PAGE_W - MARGIN, y - 2);
    y += 2;
  }
  return y;
}

function body(doc: jsPDF, y: number, text: string): number {
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    y = ensureSpace(doc, y, LINE_H);
    doc.text(line, MARGIN, y);
    y += LINE_H;
  }
  return y;
}

function bullet(doc: jsPDF, y: number, items: string[], indent = 4): number {
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  for (const item of items) {
    const wrapped = doc.splitTextToSize(item, CONTENT_W - indent);
    for (let j = 0; j < wrapped.length; j++) {
      y = ensureSpace(doc, y, LINE_H);
      doc.text(j === 0 ? `• ${wrapped[j]}` : `  ${wrapped[j]}`, MARGIN + indent, y);
      y += LINE_H;
    }
  }
  return y;
}

function keyValue(doc: jsPDF, y: number, pairs: [string, string][]): number {
  for (const [k, v] of pairs) {
    y = ensureSpace(doc, y, LINE_H);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${k}: `, MARGIN, y);
    const kw = doc.getTextWidth(`${k}: `);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(v, CONTENT_W - kw);
    doc.text(lines[0], MARGIN + kw, y);
    y += LINE_H;
    for (let i = 1; i < lines.length; i++) {
      y = ensureSpace(doc, y, LINE_H);
      doc.text(lines[i], MARGIN + kw, y);
      y += LINE_H;
    }
  }
  return y;
}

function coverageList(doc: jsPDF, y: number, label: string, items: CoverageItem[]): number {
  if (items.length === 0) return y;
  y = body(doc, y, `${label}:`);
  y = bullet(
    doc,
    y,
    items.map((x) => `[${x.status.toUpperCase()}] ${x.name}`),
  );
  return y;
}

export function downloadPDF(status: JobStatusResponse) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  // ── Title ──
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("AppSpeX Report", MARGIN, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(REPORT_VERSION, MARGIN + doc.getTextWidth("AppSpeX Report ") + 2, MARGIN);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, y);
  y += LINE_H;
  doc.text(`Job ID: ${status.jobId}`, MARGIN, y);
  y += LINE_H;
  doc.text(`Pipeline Version: ${REPORT_VERSION}`, MARGIN, y);
  y += 8;
  doc.setTextColor(0);

  // ── 1. Coverage Summary (first thing reviewers see) ──
  const coverage =
    status.intent && status.appSpec && status.dataSchema
      ? computeCoverage(status.intent, status.appSpec, status.dataSchema)
      : null;

  if (coverage) {
    y = heading(doc, y, "1. Coverage Summary");
    y = keyValue(doc, y, [
      ["Overall Coverage", `${coverage.overallPercent}%`],
      [
        "Entities",
        `${coverage.entities.filter((x) => x.status === "ok").length}/${coverage.entities.length}`,
      ],
      [
        "Features",
        `${coverage.features.filter((x) => x.status === "ok").length}/${coverage.features.length}`,
      ],
      [
        "Integrations",
        `${coverage.integrations.filter((x) => x.status === "ok").length}/${coverage.integrations.length}`,
      ],
    ]);
    if (coverage.businessRules.length > 0) {
      y = keyValue(doc, y, [
        [
          "Business Rules",
          `${coverage.businessRules.filter((x) => x.status === "ok").length}/${coverage.businessRules.length}`,
        ],
      ]);
    }
    y += 4;
  }

  // ── 2. Prompt ──
  y = heading(doc, y, "2. Prompt");
  y = body(doc, y, status.prompt);
  y += 4;

  // ── 3. Intent ──
  if (status.intent) {
    y = heading(doc, y, "3. Intent Extraction");
    y = keyValue(doc, y, [
      ["App Name", status.intent.appName],
      ["App Type", status.intent.appType],
    ]);
    y += 2;

    y = heading(doc, y, "Features", 3);
    y = bullet(doc, y, status.intent.features);
    y += 2;

    y = heading(doc, y, "Entities", 3);
    y = bullet(doc, y, status.intent.entities);
    y += 2;

    if (status.intent.integrations_requested.length > 0) {
      y = heading(doc, y, "Integrations Requested", 3);
      y = bullet(doc, y, status.intent.integrations_requested);
      y += 2;
    }

    if (status.intent.businessRules && status.intent.businessRules.length > 0) {
      y = heading(doc, y, "Business Rules", 3);
      y = bullet(doc, y, status.intent.businessRules);
      y += 2;
    }

    if (status.intent.assumptions.length > 0) {
      y = heading(doc, y, "Assumptions", 3);
      y = bullet(doc, y, status.intent.assumptions);
      y += 2;
    }
  }

  // ── 4. Data Schema ──
  if (status.dataSchema) {
    y = heading(doc, y, "4. Data Schema");
    for (const entity of status.dataSchema.entities) {
      y = heading(doc, y, entity.name, 3);
      if (entity.description) {
        y = body(doc, y, entity.description);
        y += 1;
      }
      y = keyValue(doc, y, [["Table", entity.tableName]]);

      const fieldLines = entity.fields.map(
        (f) =>
          `${f.name} (${f.type})${f.isPrimary ? " [PK]" : ""}${f.isUnique ? " [UNIQUE]" : ""}${f.nullable ? " nullable" : ""}`,
      );
      y = bullet(doc, y, fieldLines);

      if (entity.relations.length > 0) {
        const relLines = entity.relations.map(
          (r) => `${r.type} → ${r.target} (${r.foreignKey})`,
        );
        y = body(doc, y, "Relations:");
        y = bullet(doc, y, relLines);
      }
      y += 3;
    }
  }

  // ── 5. AppSpec ──
  if (status.appSpec) {
    y = heading(doc, y, "5. Application Specification");

    y = heading(doc, y, "Pages", 3);
    for (const p of status.appSpec.pages) {
      y = body(
        doc,
        y,
        `${p.name} — ${p.route} [${p.layout}] entity: ${p.entity}, components: ${p.components.join(", ")}`,
      );
    }
    y += 2;

    y = heading(doc, y, "API Endpoints", 3);
    const byEntity = new Map<string, typeof status.appSpec.apiEndpoints>();
    for (const ep of status.appSpec.apiEndpoints) {
      const list = byEntity.get(ep.entity) ?? [];
      list.push(ep);
      byEntity.set(ep.entity, list);
    }
    for (const [entity, eps] of byEntity) {
      y = body(doc, y, `${entity}:`);
      y = bullet(
        doc,
        y,
        eps.map((ep) => `${ep.method} ${ep.path} — ${ep.handlerDescription}`),
      );
    }
    y += 2;

    y = heading(doc, y, "Auth Rules", 3);
    y = keyValue(doc, y, [
      ["Roles", status.appSpec.authRules.roles.join(", ")],
    ]);
    for (const perm of status.appSpec.authRules.permissions) {
      y = body(
        doc,
        y,
        `${perm.role} → ${perm.entity}: ${perm.actions.join(", ")}`,
      );
    }
    y += 2;

    if (status.appSpec.workflowStubs.length > 0) {
      y = heading(doc, y, "Workflow Stubs", 3);
      for (const w of status.appSpec.workflowStubs) {
        const source = w.source === "synthesized" ? " [SYNTHESIZED]" : "";
        y = body(
          doc,
          y,
          `${w.name}${source}: on ${w.trigger.entity}.${w.trigger.event}${w.trigger.condition ? ` [${w.trigger.condition}]` : ""} → ${w.integration}.${w.action}`,
        );
      }
      y += 2;
    }
  }

  // ── 6. Requirement Coverage (detailed) ──
  if (coverage) {
    y = heading(doc, y, "6. Requirement Coverage");
    y = coverageList(doc, y, "Entities", coverage.entities);
    y = coverageList(doc, y, "Features", coverage.features);
    y = coverageList(doc, y, "Integrations", coverage.integrations);
    y = coverageList(doc, y, "Business Rules", coverage.businessRules);
    y += 2;
  }

  // ── 7. Generation Health ──
  const health = computeHealth(status);
  const hasHealth = health.healthy.length > 0 || health.concerning.length > 0 || health.other.length > 0;
  if (hasHealth || status.errors.length > 0) {
    y = heading(doc, y, "7. Generation Health");

    if (status.errors.length > 0) {
      y = body(doc, y, "Unresolved Errors:");
      y = bullet(
        doc,
        y,
        status.errors.map((e) => `${e.code} at ${e.path}: ${e.message}`),
      );
      y += 2;
    }

    if (health.healthy.length > 0) {
      y = body(doc, y, `Healthy Repairs (${health.healthy.length}):`);
      y = bullet(
        doc,
        y,
        health.healthy.map((d) => `[OK] ${d}`),
      );
      y += 1;
    }

    if (health.concerning.length > 0) {
      y = body(doc, y, `Concerning Repairs (${health.concerning.length}):`);
      y = bullet(
        doc,
        y,
        health.concerning.map((d) => `[WARN] ${d}`),
      );
      y += 1;
    }

    if (health.other.length > 0) {
      y = body(doc, y, `Other Repairs (${health.other.length}):`);
      y = bullet(doc, y, health.other);
      y += 1;
    }

    if (!hasHealth && status.errors.length === 0) {
      y = body(doc, y, "Perfect generation — no repairs or errors.");
    }
    y += 2;
  } else {
    y = heading(doc, y, "7. Generation Health");
    y = body(doc, y, "Perfect generation — no repairs or errors.");
    y += 2;
  }

  // ── 8. Cost & Latency ──
  y = heading(doc, y, "8. Cost & Latency");
  y = keyValue(doc, y, [
    ["Total Cost", `$${status.cost.totalUsd.toFixed(6)}`],
    ["Total Latency", `${status.cost.totalLatencyMs} ms`],
  ]);
  y += 2;
  for (const s of status.cost.perStage) {
    y = body(
      doc,
      y,
      `${s.stage}: ${s.model} — ${s.calls} call(s), ${s.tokensIn}→${s.tokensOut} tokens, $${s.costUsd.toFixed(6)}, ${s.latencyMs}ms`,
    );
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160);
    doc.text(
      `AppSpeX Report ${REPORT_VERSION} — Page ${i}/${pages}`,
      MARGIN,
      292,
    );
    doc.setTextColor(0);
  }

  doc.save(`appspex_${sanitiseFilename(status.prompt)}.pdf`);
}
