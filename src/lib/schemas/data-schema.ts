import { z } from "zod";

/**
 * Stage 2 output: DataSchema.
 *
 * IMPORTANT: this schema validates SHAPE only — field types, enums, required
 * keys. Semantic rules (every entity has a `tenantId`, relations are
 * bidirectionally consistent) live in the validation engine as named checks, so
 * each failure is a structured, repairable, log-able error rather than an opaque
 * Zod refine. See src/lib/validation.
 */

/**
 * Allowed column types. Closed enum so the LLM cannot improvise (`varchar`,
 * `int`, ...) — anything outside this set fails validation and gets repaired.
 * `string` = short text, `text` = long text.
 */
export const FieldTypeEnum = z.enum([
  "string",
  "text",
  "integer",
  "float",
  "boolean",
  "date",
  "datetime",
  "uuid",
  "json",
]);
export type FieldType = z.infer<typeof FieldTypeEnum>;

export const RelationTypeEnum = z.enum(["hasMany", "belongsTo", "hasOne"]);
export type RelationType = z.infer<typeof RelationTypeEnum>;

export const OnDeleteEnum = z.enum([
  "cascade",
  "set_null",
  "restrict",
  "no_action",
]);
export type OnDelete = z.infer<typeof OnDeleteEnum>;

export const FieldSchema = z.object({
  name: z.string().min(1),
  type: FieldTypeEnum,
  nullable: z.boolean(),
  /** True for foreign-key columns that back a relation. */
  isRelation: z.boolean(),
  isPrimary: z.boolean(),
  isUnique: z.boolean(),
});
export type Field = z.infer<typeof FieldSchema>;

export const RelationSchema = z.object({
  type: RelationTypeEnum,
  /** Name of the entity on the other side of the relation. */
  target: z.string().min(1),
  /**
   * The foreign-key column name, kept on BOTH sides so the validation engine can
   * match a `belongsTo` to its inverse `hasMany`/`hasOne` for bidirectional
   * consistency.
   */
  foreignKey: z.string().min(1),
  onDelete: OnDeleteEnum,
});
export type Relation = z.infer<typeof RelationSchema>;

/** snake_case: lowercase letters/digits/underscores, must start with a letter. */
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

export const EntitySchema = z.object({
  /** PascalCase domain noun, e.g. "Deal". */
  name: z.string().min(1),
  /** snake_case table name, e.g. "deals". */
  tableName: z.string().regex(SNAKE_CASE, "tableName must be snake_case"),
  fields: z.array(FieldSchema),
  relations: z.array(RelationSchema),
});
export type EntitySchema = z.infer<typeof EntitySchema>;

export const DataSchema = z.object({
  entities: z.array(EntitySchema),
});
export type DataSchema = z.infer<typeof DataSchema>;
