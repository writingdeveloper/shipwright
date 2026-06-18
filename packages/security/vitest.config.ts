import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/security`.
 *
 * Scope is the dependency-free in-memory rate limiter, driven by an injectable
 * clock so window behaviour is deterministic with no timers, network, or Redis.
 * The Upstash adapter (opt-in, keyed) is intentionally NOT unit-tested here — it
 * is a thin wrapper over `@upstash/ratelimit` that only activates with real
 * credentials. Runs in `node`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
