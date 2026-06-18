/**
 * Static, request-independent security response headers.
 *
 * These are the headers whose value never changes per request, so they belong
 * in `next.config.ts`'s `headers()` (applied to every route, cached by the build)
 * rather than recomputed in the proxy on every request. The Content-Security-
 * Policy is deliberately NOT here: it carries a per-request nonce and is set in
 * `proxy.ts` (see `@repo/config/csp`).
 *
 * Shape (`{ key, value }[]`) matches what Next's `headers()` expects for a
 * route's `headers` array, so an app can spread it directly:
 *
 *   async headers() {
 *     return [{ source: "/(.*)", headers: [...securityHeaders] }];
 *   }
 */

export type SecurityHeader = {
  readonly key: string;
  readonly value: string;
};

/**
 * Permissions-Policy: deny powerful features by default.
 *
 * An empty allowlist (`feature=()`) disables the feature for the page and all
 * embedded frames. A starter app needs none of camera/mic/geolocation/etc., so
 * we opt them all out; an app that needs one removes it from this string (or
 * overrides the header). `browsing-topics=()` opts out of the Topics API.
 */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

/**
 * The reusable security-headers list for `next.config` `headers()`.
 *
 * - **X-Frame-Options: DENY** — legacy clickjacking guard. The modern equivalent
 *   is CSP `frame-ancestors 'none'` (set in the proxy); both ship for breadth of
 *   browser coverage.
 * - **X-Content-Type-Options: nosniff** — stop MIME-type sniffing, so a response
 *   is only ever executed/loaded as its declared `Content-Type`.
 * - **Referrer-Policy: strict-origin-when-cross-origin** — send the full URL only
 *   same-origin; cross-origin send just the origin; never leak a path/query to a
 *   less-secure (HTTP) destination. This is also the browser default — we pin it
 *   so it can't be weakened by a referrer further up the chain.
 * - **Permissions-Policy** — deny powerful browser features by default (see above).
 * - **Strict-Transport-Security** — force HTTPS for two years, include subdomains,
 *   and allow HSTS preloading. Only honoured over HTTPS, so it is inert on local
 *   `http://localhost` and safe to send everywhere.
 *
 * X-XSS-Protection is intentionally omitted: it is deprecated, off in modern
 * browsers, and can introduce vulnerabilities — CSP is the real XSS defence.
 */
export const securityHeaders: readonly SecurityHeader[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];
