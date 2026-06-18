import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards for the pure Sentry config — the no-op gate and the CSP `connect-src`
 * behaviour the proxy depends on.
 *
 * The Sentry env vars are set/cleared per test BEFORE `@repo/env` (and thus
 * `../src/config`) is imported, then modules are reset, so each case sees a
 * deterministic env regardless of the developer's shell. Mirrors the analytics
 * config test exactly.
 */

const DSN = "SENTRY_DSN";
const PUBLIC_DSN = "NEXT_PUBLIC_SENTRY_DSN";

const SAMPLE_DSN = "https://abc123@o42.ingest.sentry.io/4567";

beforeEach(() => {
  vi.resetModules();
  delete process.env[DSN];
  delete process.env[PUBLIC_DSN];
});

afterEach(() => {
  delete process.env[DSN];
  delete process.env[PUBLIC_DSN];
});

describe("observability config with NO DSN (the default / CI path)", () => {
  it("reports Sentry disabled", async () => {
    const { isSentryEnabled } = await import("../src/config");
    expect(isSentryEnabled()).toBe(false);
  });

  it("contributes NO connect-src origin, so the CSP is not broadened", async () => {
    const { sentryConnectSrc } = await import("../src/config");
    expect(sentryConnectSrc()).toEqual([]);
  });

  it("exposes no DSN", async () => {
    const { sentryDsn, publicSentryDsn } = await import("../src/config");
    expect(sentryDsn()).toBeUndefined();
    expect(publicSentryDsn()).toBeUndefined();
  });
});

describe("observability config WITH a DSN", () => {
  it("reports Sentry enabled from the server DSN", async () => {
    process.env[DSN] = SAMPLE_DSN;
    const { isSentryEnabled } = await import("../src/config");
    expect(isSentryEnabled()).toBe(true);
  });

  it("reports Sentry enabled from only the public DSN", async () => {
    process.env[PUBLIC_DSN] = SAMPLE_DSN;
    const { isSentryEnabled, publicSentryDsn } = await import("../src/config");
    expect(isSentryEnabled()).toBe(true);
    expect(publicSentryDsn()).toBe(SAMPLE_DSN);
  });

  it("adds the DSN host origin to connect-src", async () => {
    process.env[DSN] = SAMPLE_DSN;
    const { sentryConnectSrc } = await import("../src/config");
    expect(sentryConnectSrc()).toEqual(["https://o42.ingest.sentry.io"]);
  });

  it("contributes nothing for a malformed DSN rather than crashing", async () => {
    process.env[DSN] = "not a url";
    const { sentryConnectSrc } = await import("../src/config");
    expect(sentryConnectSrc()).toEqual([]);
  });

  it("prefers the server DSN over the public one", async () => {
    process.env[DSN] = "https://server@o1.ingest.sentry.io/1";
    process.env[PUBLIC_DSN] = "https://public@o2.ingest.sentry.io/2";
    const { sentryDsn } = await import("../src/config");
    expect(sentryDsn()).toBe("https://server@o1.ingest.sentry.io/1");
  });
});
