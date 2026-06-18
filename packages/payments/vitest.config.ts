import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/payments`.
 *
 * Three pure, account-free checks (no Stripe network call is ever made — the
 * Stripe client is never constructed in any of these paths):
 * - `createCheckoutSession` no-ops (returns `{ configured: false }`, never throws)
 *   when `STRIPE_SECRET_KEY` is absent — the graceful-degradation contract;
 * - `constructWebhookEvent` throws on a bad/forged signature (and no-ops without
 *   a webhook secret);
 * - `handleWebhookEvent` is IDEMPOTENT — the same `event.id` is processed once
 *   and a second delivery is a no-op (Stripe retries the same event on any
 *   non-2xx, so duplicate deliveries are the norm, not the exception).
 *
 * `environment: "node"` because the helpers run server-side. The idempotency /
 * subscription-state tests use a REAL libSQL temp database (see
 * `test/handle-webhook.test.ts`), so the first test pays for a `drizzle-kit push`
 * subprocess — hence the roomy hook timeout. The real proof that the dashboard
 * stays stable with Stripe unconfigured lives in the web app's Playwright suite
 * (`test:e2e`), which runs with no key set.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    hookTimeout: 60_000,
    testTimeout: 20_000,
    // A real on-disk libSQL DB is created per file; a single fork keeps the
    // libSQL native module from loading in many workers at once.
    pool: "forks",
  },
});
