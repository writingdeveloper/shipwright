import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards for the pure analytics config — the no-op gate and the CSP
 * `connect-src` behaviour the proxy depends on.
 *
 * The PostHog env vars are set/cleared per test BEFORE `@repo/env` (and thus
 * `../src/config`) is imported, then modules are reset, so each case sees a
 * deterministic env regardless of the developer's shell.
 */

const KEY = "NEXT_PUBLIC_POSTHOG_KEY";
const HOST = "NEXT_PUBLIC_POSTHOG_HOST";

beforeEach(() => {
  vi.resetModules();
  delete process.env[KEY];
  delete process.env[HOST];
});

afterEach(() => {
  delete process.env[KEY];
  delete process.env[HOST];
});

describe("analytics config with NO key (the default / CI path)", () => {
  it("reports analytics disabled", async () => {
    const { isAnalyticsEnabled } = await import("../src/config");
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it("contributes NO connect-src origin, so the CSP is not broadened", async () => {
    const { analyticsConnectSrc } = await import("../src/config");
    expect(analyticsConnectSrc()).toEqual([]);
  });
});

describe("analytics config WITH a key", () => {
  beforeEach(() => {
    process.env[KEY] = "phc_test_key";
  });

  it("reports analytics enabled", async () => {
    const { isAnalyticsEnabled } = await import("../src/config");
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it("defaults the host to the US cloud when none is configured", async () => {
    const { analyticsHost, DEFAULT_POSTHOG_HOST } = await import("../src/config");
    expect(analyticsHost()).toBe(DEFAULT_POSTHOG_HOST);
  });

  it("adds the configured host's origin to connect-src", async () => {
    process.env[HOST] = "https://eu.i.posthog.com";
    const { analyticsConnectSrc } = await import("../src/config");
    expect(analyticsConnectSrc()).toEqual(["https://eu.i.posthog.com"]);
  });

  it("uses the default host origin in connect-src when host is unset", async () => {
    const { analyticsConnectSrc, DEFAULT_POSTHOG_HOST } = await import(
      "../src/config"
    );
    expect(analyticsConnectSrc()).toEqual([new URL(DEFAULT_POSTHOG_HOST).origin]);
  });
});
