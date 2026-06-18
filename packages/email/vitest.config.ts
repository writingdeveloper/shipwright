import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/email`.
 *
 * Two pure, account-free checks (no Resend network call is ever made):
 * - the send helper no-ops (returns `{ skipped: true }`, never throws) when
 *   `RESEND_API_KEY`/`EMAIL_FROM` are absent — the graceful-degradation contract;
 * - the `WelcomeEmail` template renders to HTML.
 *
 * `environment: "node"` because the helpers run server-side. The real proof that
 * sign-up still works with email unconfigured lives in the web app's Playwright
 * suite (`test:e2e`), which signs up repeatedly with no key set.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
});
