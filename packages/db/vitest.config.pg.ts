import { defineConfig } from "vitest/config";

/**
 * Vitest config for the POSTGRES swap-path suite (the `*.pg.test.ts` files).
 *
 * Separate from the default `vitest.config.ts` (which EXCLUDES `*.pg.test.ts`)
 * because these tests require a real Postgres reachable at `DATABASE_URL` — the
 * `pg-compat` CI workflow provides one via a service container. The first test
 * pays for a `drizzle-kit push --config drizzle.config.pg.ts` subprocess, hence
 * the roomy hook timeout.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.pg.test.ts"],
    hookTimeout: 90_000,
    testTimeout: 30_000,
    pool: "forks",
  },
});
