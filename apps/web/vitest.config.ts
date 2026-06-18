import { defineConfig } from "vitest/config";

/**
 * Vitest config for the web app's fast unit tests.
 *
 * Scope is deliberately narrow: pure, framework-free logic (e.g. input
 * validation) that needs no server, browser, or database. End-to-end coverage
 * of the real app lives in Playwright (`test:e2e`); data-layer security
 * invariants live in `@repo/db`'s Vitest suite.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
