import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/legal`.
 *
 * Unit tests cover the pure consent cookie codec (`consent.ts`) — parse/
 * serialise/expiry logic — and the config defaults. The rendered policy pages
 * and the cookie-consent banner UI are proven end-to-end in the web app's
 * Playwright suite (`test:e2e`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
