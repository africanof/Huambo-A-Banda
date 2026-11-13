import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Integration tests bind real ports; keep files sequential for determinism.
    fileParallelism: false,
  },
});
