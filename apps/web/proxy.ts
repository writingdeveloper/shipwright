import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_HEADER,
  generateNonce,
  NONCE_HEADER,
} from "@repo/config/csp";
import { analyticsConnectSrc } from "@repo/analytics/config";

import { env } from "./env";

/**
 * Nonce-based Content-Security-Policy, the official Next.js App Router pattern
 * (https://nextjs.org/docs/app/guides/content-security-policy).
 *
 * NOTE on the filename: Next.js 16 deprecated `middleware.ts` and renamed the
 * convention to `proxy.ts` (the function is `proxy`, not `middleware`). Using the
 * old name still works but logs a deprecation warning; this repo targets Next 16,
 * so we use the current `proxy.ts` convention. The CSP wiring is identical to the
 * documented middleware example.
 *
 * Per request we:
 *   1. mint a fresh nonce (unpredictable, single-use);
 *   2. build the policy with that nonce and set it on the REQUEST headers so the
 *      renderer sees it and stamps the nonce onto Next's own scripts/styles
 *      (framework runtime, page bundles, `next/font` inline `<style>`, the RSC
 *      bootstrap, Server-Action wiring) — no manual per-tag nonce needed;
 *   3. expose the raw nonce as `x-nonce` for any component that renders its own
 *      `<Script nonce>`;
 *   4. set the same policy on the RESPONSE so the browser enforces it.
 *
 * Because the nonce is server-rendered, matched pages render dynamically — that
 * is inherent to nonce CSP. The static security headers live in `next.config.ts`.
 */
export function proxy(request: NextRequest): NextResponse {
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

  // PostHog's ingestion origin — but ONLY when analytics is configured (a key is
  // set). With no key this is `[]`, so the production CSP stays strict and is
  // never broadened for a feature that will never open a connection.
  const connectSrc = [...authConnectSrc, ...analyticsConnectSrc()];

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

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT the ones that don't need a CSP header, and skip
     * prefetches (a `next/link` prefetch shouldn't pay for a fresh nonce):
     * - api            (route handlers, incl. /api/auth/* — same-origin fetch)
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
