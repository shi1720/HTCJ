import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/*.test.ts", "workers/*.test.ts"],
    setupFiles: ["./workers/router-compat.ts"],
  },
});
