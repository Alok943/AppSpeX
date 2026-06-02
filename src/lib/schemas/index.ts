/**
 * The typed spine of the pipeline. Each stage's output is defined here once, as
 * a Zod schema that doubles as the TypeScript type via `z.infer`.
 *
 *   AppIntent  --Stage 2-->  DataSchema  --Stage 3-->  AppSpec
 */
export * from "./intent";
export * from "./data-schema";
export * from "./app-spec";
