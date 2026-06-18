/**
 * @repo/config — shared production-hardening configuration.
 *
 * Two concerns, also importable via subpaths (`@repo/config/headers`,
 * `@repo/config/csp`):
 * - Static security response headers for `next.config.ts`'s `headers()`.
 * - Nonce-based Content-Security-Policy helpers for the App Router proxy.
 *
 * Per the repo discipline this was extracted once the reference app (`apps/web`)
 * actually needed CSP + security headers, not pre-stubbed. See the package
 * `CLAUDE.md` for the wiring contract.
 */

export { securityHeaders, type SecurityHeader } from "./headers";

export {
  generateNonce,
  buildContentSecurityPolicy,
  NONCE_HEADER,
  CONTENT_SECURITY_POLICY_HEADER,
  type CspOptions,
} from "./csp";
