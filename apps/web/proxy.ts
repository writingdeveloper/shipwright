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

import { applyI18n } from "./i18n/proxy";
import { env } from "./env";

/**
 * Nonce-based Content-Security-Policy + auth rate limiting + next-intl locale
 * routing, composed in one pass (Next.js 16 `proxy.ts`, formerly middleware.ts).
 *
 * Three responsibilities, split by path (see the matcher below):
 *   1. `/api/auth/*` POSTs → rate-limited per client IP (429 on flood).
 *   2. every other matched (page) request → next-intl resolves/redirects the
 *      locale (URL-prefix, `as-needed`) AND a fresh per-request nonce CSP is
 *      layered onto its response (see `withCsp`).
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

/**
 * Run locale routing (the `applyI18n` seam over next-intl), then layer the
 * per-request nonce CSP onto its result.
 *
 * next-intl owns the locale rewrite/redirect + the NEXT_LOCALE cookie. We inject
 * the nonce on the REQUEST headers (so Next nonces its own bootstrap scripts) and
 * the CSP on the RESPONSE (so the browser enforces it), while carrying over
 * next-intl's rewrite target and its own headers (cookie, Vary). A locale
 * REDIRECT needs no nonce — the browser re-requests the new URL through here.
 */
function withCsp(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";

  // Same-origin auth (`/api/auth/*`) is covered by `connect-src 'self'`. If the
  // browser auth client is pointed at a DIFFERENT origin via
  // NEXT_PUBLIC_BETTER_AUTH_URL, allow that origin for fetch/XHR.
  const authOrigin = env.NEXT_PUBLIC_BETTER_AUTH_URL
    ? new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin
    : undefined;
  const authConnectSrc =
    authOrigin && authOrigin !== request.nextUrl.origin ? [authOrigin] : [];

  // PostHog's / Sentry's / GA's ingestion origins — ONLY when each is configured.
  const connectSrc = [
    ...authConnectSrc,
    ...analyticsConnectSrc(),
    ...gaConnectSrc(),
    ...sentryConnectSrc(),
  ];

  const csp = buildContentSecurityPolicy({ nonce, isDev, connectSrc });

  const intlResponse = applyI18n(request);

  // Locale redirect (e.g. a /en/* default-locale path normalised to /*, or a
  // NEXT_LOCALE cookie disagreeing with the path): the browser re-requests, so
  // only the CSP header is needed on the redirect itself.
  if (intlResponse.headers.get("location")) {
    intlResponse.headers.set(CONTENT_SECURITY_POLICY_HEADER, csp);
    return intlResponse;
  }

  // Otherwise rebuild the response so the nonce + CSP ride on the REQUEST headers
  // upstream to the renderer, carrying over next-intl's internal rewrite target.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, csp);

  const rewrite = intlResponse.headers.get("x-middleware-rewrite");
  const response = rewrite
    ? NextResponse.rewrite(new URL(rewrite, request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });

  // Preserve next-intl's own response headers (NEXT_LOCALE cookie, Vary) but drop
  // the internal middleware directives we've just reissued.
  intlResponse.headers.forEach((value, key) => {
    if (key !== "x-middleware-rewrite" && key !== "x-middleware-next") {
      response.headers.set(key, value);
    }
  });

  // Enforce the policy in the browser on the RESPONSE.
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, csp);

  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // (1) Auth endpoints: throttle brute-force POSTs by IP. GETs pass through.
  if (request.nextUrl.pathname.startsWith(AUTH_PATH_PREFIX)) {
    if (request.method === "POST") {
      const limited = await enforceAuthRateLimit(request);
      if (limited) return limited;
    }
    return NextResponse.next();
  }

  // (2) Every other matched (page) request: locale routing + nonce CSP.
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
     * (b) All page paths EXCEPT those that must NOT be locale-routed or need no
     * CSP, and skip prefetches (a `next/link` prefetch shouldn't pay for a fresh
     * nonce). Excludes api, Next internals, every file-extension route (sw.js,
     * sitemap.xml, robots.txt, manifest.webmanifest, icon.svg, llms.txt, favicon
     * — matched by `.*\\..*`), and the extensionless metadata routes
     * opengraph-image + apple-icon. These live OUTSIDE `[locale]` and would 404 if
     * locale-rewritten (notably /sw.js, which must stay at the root to control /).
     */
    {
      source: "/((?!api|_next|opengraph-image|apple-icon|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
