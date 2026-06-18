import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/config`.
 *
 * Pure, framework-free unit tests over the CSP/header string builders — no
 * server, browser, or DB. End-to-end proof that the policy actually lets the
 * real app run lives in the web app's Playwright suite (`test:e2e`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
