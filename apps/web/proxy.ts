import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_HEADER,
  generateNonce,
  NONCE_HEADER,
} from "@repo/config/csp";
import { analyticsConnectSrc, gaConnectSrc } from "@repo/analytics/config";
import { sentryConnectSrc } from "@repo/observability/config";
import { logger } from "@repo/observability/logger";
import { createRateLimiter } from "@repo/security/ratelimit";

import { env } from "./env";

/**
 * Nonce-based Content-Security-Policy, the official Next.js App Router pattern
 * (https://nextjs.org/docs/app/guides/content-security-policy), PLUS brute-force
 * rate limiting on the auth endpoints.
 *
 * NOTE on the filename: Next.js 16 deprecated `middleware.ts` and renamed the
 * convention to `proxy.ts` (the function is `proxy`, not `middleware`). Using the
 * old name still works but logs a deprecation warning; this repo targets Next 16,
 * so we use the current `proxy.ts` convention. The CSP wiring is identical to the
 * documented middleware example.
 *
 * Two responsibilities, split by path (see the matcher below):
 *   1. `/api/auth/*` POSTs → rate-limited per client IP (see `authRateLimiter`),
 *      returning 429 when a single IP floods sign-in/sign-up. Other API routes
 *      and non-POST auth calls pass straight through.
 *   2. every other matched (page) request → a fresh per-request nonce CSP.
 */

/**
 * Brute-force guard for the auth endpoints.
 *
 * Algorithm: a SLIDING WINDOW of {@link AUTH_RATE_LIMIT} requests per
 * {@link AUTH_RATE_WINDOW_MS} per client IP (`@repo/security`). Backend is the
 * dependency-free in-memory limiter by default, automatically upgrading to
 * Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are
 * set (so a multi-instance deployment shares the window).
 *
 * The limit is chosen to sit COMFORTABLY above normal usage so the e2e (a handful
 * of sign-ups/sign-ins across the suite) is never throttled: 10 auth POSTs per
 * 10s per IP is far more than a human — or the Playwright journey — issues in a
 * 10-second window, but low enough to blunt a credential-stuffing burst. The
 * limiter is constructed ONCE at module scope so its window persists across
 * requests within an instance.
 */
const AUTH_RATE_LIMIT = 10;
const AUTH_RATE_WINDOW_MS = 10_000;

const authRateLimiter = createRateLimiter({
  limit: AUTH_RATE_LIMIT,
  windowMs: AUTH_RATE_WINDOW_MS,
  prefix: "auth",
});

/** Path prefix of the Better Auth route handlers. */
const AUTH_PATH_PREFIX = "/api/auth";

/**
 * Best-effort client IP. Prefers the left-most `x-forwarded-for` hop (the
 * original client behind Vercel/proxies), falling back to `x-real-ip`, then a
 * constant so the limiter still functions locally where no proxy sets these.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}

/** Rate-limit an auth POST. Returns a 429 response when over the limit, else null. */
async function enforceAuthRateLimit(
  request: NextRequest,
): Promise<NextResponse | null> {
  const ip = clientIp(request);
  const { success, remaining, reset, limit } = await authRateLimiter.limit(ip);

  if (success) return null;

  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  logger.warn("auth rate limit exceeded", {
    ip,
    path: request.nextUrl.pathname,
    retryAfterSec,
  });

  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": String(remaining),
        "RateLimit-Reset": String(Math.ceil(reset / 1000)),
      },
    },
  );
}

/** Build the strict, per-request nonce CSP response for a page request. */
function withCsp(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";

  // Same-origin auth (`/api/auth/*`) is covered by `connect-src 'self'`. If the
  // browser auth client is pointed at a DIFFERENT origin via
  // NEXT_PUBLIC_BETTER_AUTH_URL, allow that origin for fetch/XHR so sign-in/up
  // calls aren't blocked.
  const authOrigin = env.NEXT_PUBLIC_BETTER_AUTH_URL
    ? new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin
    : undefined;
  const authConnectSrc =
    authOrigin && authOrigin !== request.nextUrl.origin ? [authOrigin] : [];

  // PostHog's and Sentry's ingestion origins — but ONLY when each is configured
  // (a key / DSN is set). With neither set these are `[]`, so the production CSP
  // stays strict and is never broadened for a feature that will never open a
  // connection.
  const connectSrc = [
    ...authConnectSrc,
    ...analyticsConnectSrc(),
    ...gaConnectSrc(),
    ...sentryConnectSrc(),
  ];

  const csp = buildContentSecurityPolicy({ nonce, isDev, connectSrc });

  // Forward the nonce + policy upstream to the renderer on the REQUEST headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Enforce the policy in the browser on the RESPONSE.
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, csp);

  return response;
}

/**
 * Per request we either (a) rate-limit an auth POST, or (b) mint a fresh nonce
 * and emit the strict CSP. Because the nonce is server-rendered, matched pages
 * render dynamically — that is inherent to nonce CSP. The static security
 * headers live in `next.config.ts`.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  // (1) Auth endpoints: throttle brute-force POSTs by IP. Only POSTs mutate
  // credentials (sign-up/sign-in/etc.); GETs (e.g. session reads) are left
  // alone so the app stays responsive. Auth JSON responses don't need the page
  // CSP, so on the allowed path we simply continue.
  if (request.nextUrl.pathname.startsWith(AUTH_PATH_PREFIX)) {
    if (request.method === "POST") {
      const limited = await enforceAuthRateLimit(request);
      if (limited) return limited;
    }
    return NextResponse.next();
  }

  // (2) Every other matched (page) request gets the nonce CSP.
  return withCsp(request);
}

export const config = {
  matcher: [
    /*
     * (a) The auth endpoints, so POSTs there can be rate-limited. This is the
     *     ONLY `/api/*` path the proxy runs on.
     */
    "/api/auth/:path*",
    /*
     * (b) All page paths EXCEPT the ones that don't need a CSP header, and skip
     * prefetches (a `next/link` prefetch shouldn't pay for a fresh nonce):
     * - api            (route handlers; the auth subset is matched separately above)
     * - _next/static   (immutable build assets)
     * - _next/image    (image optimization endpoint)
     * - favicon.ico    (static favicon)
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
