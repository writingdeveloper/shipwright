import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_HEADER,
  generateNonce,
  NONCE_HEADER,
} from "@repo/config/csp";
import { logger } from "@repo/observability/logger";
import { createRateLimiter } from "@repo/security/ratelimit";

/**
 * Nonce-based CSP + auth rate-limit for the admin app (Next.js 16 `proxy.ts`).
 *
 * The admin app has no i18n and no analytics/Sentry, so this is the apps/web
 * proxy minus the locale layer: same-origin `/api/auth/*` is covered by the
 * default `connect-src 'self'`, so no extra connect-src is needed.
 *
 *   1. `/api/auth/*` POSTs → rate-limited per client IP (429 on flood).
 *   2. every other matched page request → a fresh per-request nonce CSP.
 */
const AUTH_PATH_PREFIX = "/api/auth";

const authRateLimiter = createRateLimiter({
  limit: 10,
  windowMs: 10_000,
  prefix: "admin-auth",
});

/** Best-effort client IP (left-most `x-forwarded-for` hop, then `x-real-ip`). */
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
  logger.warn("admin auth rate limit exceeded", { ip, retryAfterSec });

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

/** Layer a per-request nonce CSP onto the page response. */
function withCsp(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildContentSecurityPolicy({ nonce, isDev });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CONTENT_SECURITY_POLICY_HEADER, csp);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith(AUTH_PATH_PREFIX)) {
    if (request.method === "POST") {
      const limited = await enforceAuthRateLimit(request);
      if (limited) return limited;
    }
    return NextResponse.next();
  }
  return withCsp(request);
}

export const config = {
  matcher: [
    // Auth endpoints, so POSTs can be rate-limited.
    "/api/auth/:path*",
    // All page paths except api, Next internals, and any file-extension route;
    // skip link prefetches (no need to mint a nonce for a prefetch).
    {
      source: "/((?!api|_next|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
