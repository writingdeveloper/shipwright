import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/pwa`.
 *
 * Account-free unit checks (no real push is ever sent — `web-push` is mocked):
 * - `config` no-ops (no public VAPID key ⇒ not configured);
 * - `defineManifest` produces a valid manifest;
 * - `deliverPush` skips without VAPID keys, sends when configured, and prunes
 *   subscriptions that return 404/410.
 *
 * `environment: "node"` because the tested helpers run server-side / are pure.
 * The client components (register/install/push client) are exercised by the web
 * app's Playwright suite, not here.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
