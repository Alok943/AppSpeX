import type { ZodType } from "zod";
import type { RepairLogEntry, RepairResult } from "@/lib/repair/types";
import type { ValidationError } from "@/lib/validation";

/** Typed default to drop in for a missing/wrong-typed primitive or container. */
const DEFAULT_FOR_EXPECTED: Record<string, unknown> = {
  string: "",
  number: 0,
  boolean: false,
  array: [],
  object: {},
  null: null,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Immutably set `value` at `path` inside `root`, creating containers as needed. */
function setAtPath(root: unknown, path: readonly PropertyKey[], value: unknown): unknown {
  if (path.length === 0) return value;
  const head = path[0];
  if (head === undefined) return root;
  const rest = path.slice(1);

  if (typeof head === "number") {
    const arr = Array.isArray(root) ? [...root] : [];
    arr[head] = setAtPath(arr[head], rest, value);
    return arr;
  }
  const obj = isRecord(root) ? { ...root } : {};
  const key = typeof head === "symbol" ? head.toString() : String(head);
  obj[key] = setAtPath(obj[key], rest, value);
  return obj;
}

/** A Zod issue exposes `expected` (a JSON type name) only for type errors. */
function readExpected(issue: object): string | null {
  const e = (issue as Record<string, unknown>)["expected"];
  return typeof e === "string" ? e : null;
}

/**
 * Field repair: for each shape error, drop in a typed default when the expected
 * type is a primitive/array/object. Deterministic — no LLM. Errors it cannot
 * safely default (e.g. a missing enum value, where guessing would be wrong) are
 * returned as `unresolved` so the caller can do a narrow re-prompt of just that
 * field.
 */
export function fieldRepair<T>(raw: unknown, schema: ZodType<T>): RepairResult<T | null> {
  const log: RepairLogEntry[] = [];
  let current: unknown = raw;

  // Re-parse / fill in a loop: fixing one level can reveal nested issues.
  for (let pass = 0; pass < 6; pass++) {
    const parsed = schema.safeParse(current);
    if (parsed.success) {
      return { data: parsed.data, log, unresolved: [] };
    }
    let progressed = false;
    for (const issue of parsed.error.issues) {
      const expected = readExpected(issue);
      if (expected !== null && expected in DEFAULT_FOR_EXPECTED) {
        current = setAtPath(current, issue.path, DEFAULT_FOR_EXPECTED[expected]);
        progressed = true;
        log.push({
          strategy: "field",
          errorInput: `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
          outcome: "repaired",
          detail: `filled typed default for missing/invalid ${expected}`,
        });
      }
    }
    if (!progressed) break;
  }

  const finalParse = schema.safeParse(current);
  if (finalParse.success) {
    return { data: finalParse.data, log, unresolved: [] };
  }

  const unresolved: ValidationError[] = [];
  for (const issue of finalParse.error.issues) {
    const path = issue.path.map(String).join(".") || "(root)";
    unresolved.push({ code: "SCHEMA_SHAPE", path, message: issue.message });
    log.push({
      strategy: "field",
      errorInput: `${path}: ${issue.message}`,
      outcome: "escalated",
      detail: "no deterministic default; needs narrow re-prompt",
    });
  }
  return { data: null, log, unresolved };
}
