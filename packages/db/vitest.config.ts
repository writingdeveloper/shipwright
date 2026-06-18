import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/db` data-layer tests.
 *
 * Tests run in a Node environment (libSQL's native driver is server-only) and
 * spin up a fresh on-disk database per file, so they are isolated from each
 * other and from any dev database. The first test in a file pays for a
 * `drizzle-kit push` subprocess, hence the roomy hook timeout.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    hookTimeout: 60_000,
    testTimeout: 20_000,
    // Each file gets its own DB; running files in a single fork keeps the
    // libSQL native module from being loaded in many workers at once.
    pool: "forks",
  },
});
