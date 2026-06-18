/**
 * @repo/legal — jurisdiction-agnostic legal content + cookie consent.
 *
 * Concerns (also importable via subpaths):
 * - `@repo/legal/config` → `LegalConfig`, `defaultLegalConfig`,
 *   `defaultSubProcessors`, `resolveLegalConfig`, `LEGAL_DISCLAIMER`.
 * - `@repo/legal/privacy-policy` → `<PrivacyPolicy config>` (Server Component).
 * - `@repo/legal/terms-of-service` → `<TermsOfService config>` (Server Component).
 * - `@repo/legal/consent` → the pure consent cookie codec + `hasConsent`
 *   (safe to import on server or client).
 * - `@repo/legal/cookie-consent` → the opt-in `<CookieConsentBanner>` client
 *   component + the `useConsent()` hook.
 *
 * The documents are GDPR/CCPA/PIPA-aware in general terms and are a TEMPLATE the
 * owner must review with a professional (see `LEGAL_DISCLAIMER`). Consent is
 * opt-in: non-essential categories stay denied until the user accepts.
 *
 * NOTE: the cookie-consent module is a client component (`"use client"`). Import
 * it from `@repo/legal/cookie-consent` in a client boundary; the server-only
 * content/config/codec are safe from the root barrel.
 */

export {
  type LegalConfig,
  type SubProcessor,
  defaultLegalConfig,
  defaultSubProcessors,
  resolveLegalConfig,
  LEGAL_DISCLAIMER,
} from "./config";

export { PrivacyPolicy, type LegalContentProps } from "./privacy-policy";
export { TermsOfService } from "./terms-of-service";

export {
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_DAYS,
  CONSENT_VERSION,
  type ConsentState,
  type ConsentCategories,
  parseConsent,
  serializeConsent,
  makeConsentState,
  readConsentFromCookieString,
  hasConsent,
  consentCookieAttributes,
  DENIED_CATEGORIES,
  GRANTED_CATEGORIES,
} from "./consent";
