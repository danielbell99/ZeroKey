import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    projects: [
      { test: { name: "api", environment: "node", include: ["tests/api/**/*.test.ts"] } },
      {
        test: {
          name: "smoke",
          environment: "node",
          include: ["tests/smoke/**/*.test.ts"],
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        "src/{domain,providers,shared}/**/*.ts": {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 85,
        },
      },
    },
  },
});
