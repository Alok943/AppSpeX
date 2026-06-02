import { defineConfig } from "vitest/config";

// `resolve.tsconfigPaths` lets tests import via the `@/*` alias (same as the
// app). Tests run in Node so the pipeline engine can be exercised without a
// server or live API keys.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
