import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/storage`.
 *
 * One account-free check: `isStorageConfigured()` is false when the S3_* vars
 * are unset — the graceful-degradation contract (no bucket ⇒ "not configured"
 * card). No S3 network call is ever made. `environment: "node"` because the
 * helpers run server-side. The real upload round-trip is a deployment-time check
 * (it needs a real bucket), not a unit test.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
});
