/**
 * Nonce-based Content-Security-Policy helpers for the Next.js App Router.
 *
 * This implements the official Next.js nonce CSP pattern
 * (https://nextjs.org/docs/app/guides/content-security-policy): a fresh,
 * unpredictable nonce is minted per request in `proxy.ts`, advertised to Next via
 * the response/request `Content-Security-Policy` header, and Next then stamps that
 * same nonce onto every script/style IT injects (the framework runtime, the page
 * bundles, `next/font`'s inline `<style>`, RSC inline bootstrap, Server-Action
 * wiring). Because the nonce is server-rendered, pages that carry it become
 * dynamically rendered — that is inherent to nonce CSP, not a bug.
 *
 * Keep this module dependency-free and framework-agnostic (it only produces
 * strings): the proxy owns reading/writing the actual request, so these helpers
 * stay trivially unit-testable and reusable across apps.
 */

/** Options for {@link buildContentSecurityPolicy}. */
export type CspOptions = {
  /** Per-request nonce from {@link generateNonce} (raw base64, no `'nonce-'` prefix). */
  nonce: string;
  /**
   * Development relaxations. In dev, React uses `eval` for richer error overlays
   * (`'unsafe-eval'` on `script-src`), and the dev server injects un-nonced inline
   * `<style>`, so `style-src` DROPS the nonce and uses `'unsafe-inline'` instead —
   * a nonce makes the browser ignore `'unsafe-inline'` on that same directive, so
   * emitting both would leave those dev styles blocked. NEITHER relaxation is
   * emitted in production: `style-src` keeps the nonce there, and `'unsafe-inline'`
   * never appears on `script-src`/`style-src`.
   */
  isDev?: boolean;
  /**
   * Extra origins to append to `connect-src` beyond `'self'`. Use this for an
   * auth/API origin that differs from the app origin (e.g. a separately-hosted
   * Better Auth). Same-origin auth needs nothing here — `'self'` covers it.
   */
  connectSrc?: readonly string[];
};

/**
 * Mint a per-request CSP nonce.
 *
 * `crypto.randomUUID()` is 122 bits of CSPRNG entropy (unpredictable, the
 * security property a nonce needs); base64-encoding matches the official Next
 * pattern and yields a token safe to drop into the header verbatim. Runs on the
 * Web Crypto `crypto` global available in both the Node and Edge proxy runtimes.
 */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * Build the `Content-Security-Policy` header value for a request.
 *
 * Directive rationale (strict by default — no `'unsafe-inline'`/`'unsafe-eval'`
 * scripts in production):
 * - `default-src 'self'` — deny-by-default fallback for any directive not named.
 * - `script-src 'self' 'nonce-<n>' 'strict-dynamic'` — only same-origin scripts
 *   and the nonce'd inline bootstrap may run; `'strict-dynamic'` lets those
 *   trusted scripts load Next's further chunks WITHOUT host-allowlisting, and
 *   makes a CSP-aware browser ignore `'self'`/host sources for scripts so an
 *   injected `<script src>` is blocked. `'unsafe-eval'` is added in dev only.
 * - `style-src 'self' 'nonce-<n>'` — same-origin stylesheets plus Next/`next/font`
 *   inline `<style>` carrying the nonce. In DEV the nonce is dropped and
 *   `'unsafe-inline'` used instead: a nonce makes the browser ignore
 *   `'unsafe-inline'`, so emitting both would leave the dev server's un-nonced
 *   styles blocked. Production keeps the nonce and never gets `'unsafe-inline'`.
 * - `style-src-attr 'unsafe-inline'` — nonces cannot cover inline `style="…"`
 *   ATTRIBUTES (only `<style>` elements), and some libraries set them. This
 *   narrowly allows style attributes WITHOUT loosening `<style>`/script policy.
 * - `img-src 'self' blob: data:` — local images plus the `blob:`/`data:` URLs
 *   Next/optimization and inlined SVGs use.
 * - `font-src 'self'` — only self-hosted fonts (this app ships `next/font/local`).
 * - `object-src 'none'` — no `<object>`/`<embed>`/`<applet>` (legacy plugin XSS).
 * - `worker-src 'self'` — only the app's own service worker may be registered.
 * - `manifest-src 'self'` — the web app manifest is same-origin.
 * - `base-uri 'self'` — block `<base>` injection that would rewrite relative URLs.
 * - `form-action 'self'` — forms (incl. Server Actions) may only POST same-origin.
 * - `frame-ancestors 'none'` — modern clickjacking guard (pairs with X-Frame-Options).
 * - `connect-src 'self' …` — fetch/XHR/WebSocket targets: same-origin (covers the
 *   same-app Better Auth `/api/auth/*` calls) plus any explicit extra origins.
 * - `upgrade-insecure-requests` — auto-upgrade any stray http subresource to https.
 *
 * The result is whitespace-collapsed to a single line, the exact normalization
 * the official guide applies before setting the header.
 */
export function buildContentSecurityPolicy(options: CspOptions): string {
  const { nonce, isDev = false, connectSrc = [] } = options;

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  // In DEV the Next dev server injects un-nonced inline <style>. A nonce makes the
  // browser IGNORE 'unsafe-inline' entirely (CSP spec), so emitting both leaves those
  // styles blocked and floods the console with violations. Dev therefore uses
  // 'unsafe-inline' WITHOUT a nonce; production keeps the nonce and stays strict.
  const styleSrc = isDev
    ? ["'self'", "'unsafe-inline'"].join(" ")
    : ["'self'", `'nonce-${nonce}'`].join(" ");

  const connect = ["'self'", ...connectSrc].join(" ");

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `object-src 'none'`,
    // PWA: allow the app's own service worker and web app manifest under the
    // strict policy. The SW is registered from same-origin /sw.js; the manifest
    // is served same-origin at /manifest.webmanifest.
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `connect-src ${connect}`,
    `upgrade-insecure-requests`,
  ];

  // Single-line, single-spaced — matches the official guide's normalization.
  return directives.join("; ");
}

/** Header name carrying the per-request nonce from the proxy to the renderer. */
export const NONCE_HEADER = "x-nonce";

/** The CSP header name, exported so the proxy and tests share one spelling. */
export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";
