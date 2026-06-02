import { jsonrepair } from "jsonrepair";
import type { RepairLogEntry } from "@/lib/repair/types";

export interface StructuralRepairResult {
  ok: boolean;
  /** Parsed object when ok; null otherwise. */
  value: unknown;
  log: RepairLogEntry;
}

function tryParse(s: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function truncateForLog(s: string, n = 160): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

/** Strip markdown code fences and prose, returning just the JSON-ish block. */
function extractJsonBlock(raw: string): string | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ?? raw;

  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  const start =
    firstObj === -1
      ? firstArr
      : firstArr === -1
        ? firstObj
        : Math.min(firstObj, firstArr);
  if (start === -1) return null;

  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  // If there's no closing bracket the output is truncated; hand the tail to
  // jsonrepair to close it.
  return end <= start ? candidate.slice(start) : candidate.slice(start, end + 1);
}

/**
 * Structural repair: recover a parseable object from malformed/truncated model
 * output. Deterministic — no LLM. Handles code fences, surrounding prose,
 * trailing commas, unquoted keys, and truncation (via `jsonrepair`).
 */
export function structuralRepair(raw: string): StructuralRepairResult {
  const errorInput = `unparseable output: "${truncateForLog(raw)}"`;

  const block = extractJsonBlock(raw);
  if (block !== null) {
    // A: a clean extract may already parse (fences / prose were the only problem).
    const extracted = tryParse(block);
    if (extracted.ok) {
      return {
        ok: true,
        value: extracted.value,
        log: {
          strategy: "structural",
          errorInput,
          outcome: "repaired",
          detail: "extracted JSON block from surrounding text",
        },
      };
    }
    // B: tolerant recovery for truncation / trailing commas / unquoted keys.
    try {
      const repaired = jsonrepair(block);
      return {
        ok: true,
        value: JSON.parse(repaired),
        log: {
          strategy: "structural",
          errorInput,
          outcome: "repaired",
          detail: "recovered malformed/truncated JSON via jsonrepair",
        },
      };
    } catch {
      // fall through to failure
    }
  }

  return {
    ok: false,
    value: null,
    log: {
      strategy: "structural",
      errorInput,
      outcome: "failed",
      detail: "could not recover valid JSON",
    },
  };
}
