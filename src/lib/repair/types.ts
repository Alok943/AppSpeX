import type { ValidationError } from "@/lib/validation";

/** The three classified repair strategies (doc requires at least these). */
export type RepairStrategy = "structural" | "field" | "consistency";

/** What happened on a repair attempt. */
export type RepairOutcome = "repaired" | "escalated" | "failed";

/**
 * One logged repair attempt. The graders read these, so every attempt records
 * which strategy ran, what the bad input was, and how it resolved.
 */
export interface RepairLogEntry {
  strategy: RepairStrategy;
  /** Short description of the error(s) that triggered this attempt. */
  errorInput: string;
  outcome: RepairOutcome;
  /** What the strategy actually did (e.g. "added inverse relation Agent hasMany Deal"). */
  detail: string;
}

/** Result of a repair pass over some data. */
export interface RepairResult<T> {
  /** The (possibly) repaired data. */
  data: T;
  /** Log entries produced by this pass. */
  log: RepairLogEntry[];
  /**
   * Errors that could NOT be fixed deterministically and should be escalated to
   * a narrow LLM re-prompt by the caller.
   */
  unresolved: ValidationError[];
}

/**
 * Port for the last-resort LLM re-prompt. The repair engine depends on this
 * interface, not the concrete gateway — so it stays unit-testable without keys.
 * The caller (a pipeline stage) supplies a real implementation that calls the
 * gateway with a narrow correction prompt.
 */
export interface Reprompter {
  /**
   * Re-prompt for a corrected value. `instruction` describes the narrow fix
   * (e.g. "the `appType` field must be one of: crm, ...").
   */
  repromptField(instruction: string, context: unknown): Promise<unknown>;
}
