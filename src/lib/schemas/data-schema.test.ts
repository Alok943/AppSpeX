import { describe, it, expect } from "vitest";
import { DataSchema, EntitySchema } from "@/lib/schemas/data-schema";

const validEntity = {
  name: "Deal",
  description: "Represents a real estate transaction",
  tableName: "deals",
  fields: [
    {
      name: "id",
      type: "uuid",
      nullable: false,
      isRelation: false,
      isPrimary: true,
      isUnique: true,
    },
  ],
  relations: [
    {
      type: "belongsTo",
      target: "Agent",
      foreignKey: "agent_id",
      onDelete: "cascade",
    },
  ],
};

describe("DataSchema (shape only)", () => {
  it("accepts a well-formed entity", () => {
    expect(DataSchema.safeParse({ entities: [validEntity] }).success).toBe(true);
  });

  it("rejects a non-snake_case tableName", () => {
    const bad = { ...validEntity, tableName: "Deals" };
    const result = EntitySchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["tableName"]);
    }
  });

  it("rejects an unknown field type", () => {
    const bad = {
      ...validEntity,
      fields: [{ ...validEntity.fields[0], type: "varchar" }],
    };
    const result = EntitySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
