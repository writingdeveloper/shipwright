import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/observability`.
 *
 * Scope is the PURE, dependency-free logic — the Sentry `config` no-op gate /
 * CSP `connect-src` behaviour and the structured `logger` — none of which need a
 * DOM or the Sentry SDK, so they run in `node`. The actual Sentry init and
 * `withSentryConfig` composition are exercised end-to-end (with NO DSN, proving
 * the disabled build still works) by the web app's `build` + Playwright suite.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
