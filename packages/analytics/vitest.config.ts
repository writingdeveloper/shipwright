import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/analytics`.
 *
 * Scope is the PURE config logic — `isAnalyticsEnabled`, `analyticsHost`,
 * `analyticsConnectSrc` — which encodes the no-op gate and the CSP `connect-src`
 * behaviour. These need no DOM/posthog, so they run in `node`. The provider's
 * consent gating is exercised end-to-end (with no key, as a transparent
 * pass-through) by the web app's Playwright suite (`test:e2e`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
