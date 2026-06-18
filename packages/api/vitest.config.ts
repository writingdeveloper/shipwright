import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/api`. One account-free check: `protectedProcedure`
 * rejects an unauthenticated call (the auth guard throws before any DB query).
 * `environment: "node"` (the router runs server-side); `setupFiles` sets
 * SKIP_ENV_VALIDATION so importing `@repo/env` (via the auth/db context) doesn't
 * require the real secrets.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
