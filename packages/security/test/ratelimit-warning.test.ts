import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimiter,
  resetRateLimitWarning,
  warnIfRateLimitNotDistributed,
} from "../src/ratelimit";

// The test setup sets SKIP_ENV_VALIDATION, so the Upstash vars are undefined and
// `isDistributedRateLimitEnabled()` is false — i.e. the in-memory path, which is
// exactly the case we must warn about in production.
describe("in-memory rate limiter warning", () => {
  beforeEach(() => {
    resetRateLimitWarning();
    vi.unstubAllEnvs();
  });

  it("warns in production when no distributed backend is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.fn();
    warnIfRateLimitNotDistributed(log);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).toContain("IN-MEMORY");
    expect(log.mock.calls[0]![0]).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("warns only once, no matter how many limiters are constructed", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.fn();
    warnIfRateLimitNotDistributed(log);
    warnIfRateLimitNotDistributed(log);
    warnIfRateLimitNotDistributed(log);
    expect(log).toHaveBeenCalledOnce();
  });

  it("stays silent outside production (dev, CI, tests use in-memory by design)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.fn();
    warnIfRateLimitNotDistributed(log);
    expect(log).not.toHaveBeenCalled();
  });

  it("createRateLimiter triggers the warning on the in-memory path", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createRateLimiter({ limit: 5, windowMs: 1000 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
