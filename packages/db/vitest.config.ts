import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/db` data-layer tests (the default libSQL suite).
 *
 * Tests run in a Node environment (libSQL's native driver is server-only) and
 * spin up a fresh on-disk database per file, so they are isolated from each
 * other and from any dev database. The first test in a file pays for a
 * `drizzle-kit push` subprocess, hence the roomy hook timeout.
 *
 * The Postgres swap-path suite (`*.pg.test.ts`) is EXCLUDED here — it needs a
 * real Postgres and runs only via `vitest.config.pg.ts` (the `pg-compat` CI
 * workflow). Without this exclude the glob below would pull `*.pg.test.ts` into
 * the default `pnpm test` run, which has no Postgres.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/**/*.pg.test.ts"],
    hookTimeout: 60_000,
    testTimeout: 20_000,
    // Each file gets its own DB; running files in a single fork keeps the
    // libSQL native module from being loaded in many workers at once.
    pool: "forks",
  },
});
