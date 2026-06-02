/**
 * Validation engine types.
 *
 * The engine runs after every pipeline stage, NEVER throws, and returns
 * structured error objects. Each error carries a precise `code` (a closed
 * union) so the repair engine can switch on it to choose a fix strategy and the
 * repair log can record failures by name.
 */

export type ValidationErrorCode =
  // Shape (Zod) failures — wrong type, missing key, bad enum, malformed JSON.
  | "SCHEMA_SHAPE"
  // DataSchema semantic failures.
  | "MISSING_TENANT_ID"
  | "RELATION_TARGET_MISSING"
  | "RELATION_NOT_BIDIRECTIONAL"
  // AppSpec semantic failures.
  | "PAGE_ENTITY_MISSING"
  | "PAGE_WITHOUT_API"
  | "ENDPOINT_ENTITY_MISSING"
  | "PERMISSION_ROLE_UNKNOWN"
  | "PERMISSION_ENTITY_MISSING"
  | "WORKFLOW_ENTITY_MISSING"
  | "HOOK_INTEGRATION_UNREGISTERED"
  | "HOOK_ACTION_INVALID"
  | "WORKFLOW_INTEGRATION_UNREGISTERED"
  | "WORKFLOW_ACTION_INVALID";

export interface ValidationError {
  /** Machine code the repair engine switches on. */
  code: ValidationErrorCode;
  /** Where the problem is, e.g. "entities[2].relations[0].target". */
  path: string;
  /** Human-readable explanation. */
  message: string;
  /** Optional structured context to help repair (expected value, ids, ...). */
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Result of validating one stage: the report plus the typed data (if shape ok). */
export interface StageValidation<T> {
  result: ValidationResult;
  data: T | null;
}

/**
 * The narrow slice of the integration registry that validation depends on.
 * (Dependency inversion: validation depends on this contract, not the concrete
 * registry built in src/lib/integrations.)
 */
export interface RegistryView {
  /** Is an integration id registered? */
  has(id: string): boolean;
  /** Does the integration expose this action id? */
  hasAction(id: string, action: string): boolean;
}
