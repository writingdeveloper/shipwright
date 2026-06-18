import { expect, test } from "@playwright/test";

/**
 * End-to-end proof for the @repo/security + @repo/observability wiring, against
 * the REAL production server (see playwright.config.ts), with NO Sentry/Upstash
 * env set (the graceful-degrade path):
 *
 * - the auth endpoints are rate-limited: a burst of POSTs from one IP eventually
 *   gets a 429 with a Retry-After header, proving the in-memory limiter is wired
 *   into the proxy; while
 * - normal traffic is NOT throttled (the separate user-journey spec signs up /
 *   signs in several times and is never blocked); and
 * - with no Sentry DSN configured the strict CSP is NOT broadened — `connect-src`
 *   stays `'self'` only (no Sentry ingest or PostHog origin), proving the gated
 *   connect-src logic stays closed by default.
 *
 * IP isolation: the limiter keys on the left-most `x-forwarded-for` hop. The
 * burst below sends a UNIQUE synthetic `X-Forwarded-For`, so it consumes its own
 * limiter bucket and can never throttle the browser-driven journey (which, run
 * locally with no proxy, is keyed under 127.0.0.1).
 */

test("auth POST flood from one IP is eventually rate-limited (429)", async ({
  request,
}) => {
  // A unique source IP for this test so it has a private limiter bucket.
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  const headers = { "X-Forwarded-For": ip };

  // The proxy allows 10 auth POSTs / 10s / IP. Fire more than that in a tight
  // loop and assert at least one is rejected with 429. Bodies are intentionally
  // bogus — we only care that the RATE LIMITER (which runs before auth) trips.
  const statuses: number[] = [];
  let retryAfter: string | null = null;

  for (let i = 0; i < 15; i++) {
    const res = await request.post("/api/auth/sign-in/email", {
      headers,
      data: { email: `nobody-${ip}@example.com`, password: "wrong-password" },
    });
    statuses.push(res.status());
    if (res.status() === 429 && retryAfter === null) {
      retryAfter = res.headers()["retry-after"] ?? null;
    }
  }

  // Once the window is saturated, further requests are throttled.
  const throttled = statuses.filter((s) => s === 429);
  expect(throttled.length).toBeGreaterThan(0);
  // And the 429 advertises when to retry.
  expect(retryAfter).not.toBeNull();
});

test("a fresh IP is allowed through (the limiter is per-key, not global)", async ({
  request,
}) => {
  // A different, previously-unused IP must NOT be throttled on its first call,
  // proving the flood above didn't trip a global limit.
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  const res = await request.post("/api/auth/sign-in/email", {
    headers: { "X-Forwarded-For": ip },
    data: { email: `fresh-${ip}@example.com`, password: "wrong-password" },
  });
  // Not rate-limited: a bad credential is 401/4xx from Better Auth, NOT 429.
  expect(res.status()).not.toBe(429);
});

test("with no Sentry DSN, the CSP connect-src is not broadened", async ({
  page,
}) => {
  const response = await page.goto("/sign-in");
  const csp = response!.headers()["content-security-policy"];
  if (!csp) throw new Error("CSP header must be present");

  const connectSrc =
    csp.split(";").find((d) => d.trim().startsWith("connect-src ")) ?? "";

  // Only 'self' — no Sentry ingest host and no PostHog origin were appended,
  // because neither a DSN nor a PostHog key is configured in this run.
  expect(connectSrc.trim()).toBe("connect-src 'self'");
  expect(connectSrc).not.toContain("sentry.io");
  expect(connectSrc).not.toContain("posthog");
});
