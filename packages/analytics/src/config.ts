import { env } from "@repo/env";

/**
 * @repo/analytics — pure, framework-free analytics configuration.
 *
 * This module derives the "is analytics even configured?" decision and the CSP
 * `connect-src` origin from `@repo/env`, with NO React and NO posthog import, so
 * it is safe to use from the proxy (to extend the CSP) and is trivially
 * unit-testable. It imports nothing that touches the DOM.
 *
 * GRACEFUL DEGRADATION starts here: if `NEXT_PUBLIC_POSTHOG_KEY` is unset, the
 * whole package is a no-op — the provider never loads posthog-js and capture
 * calls do nothing — so the app, tests, and CI run with no analytics account.
 */

/** PostHog's default ingestion host when one isn't configured (US cloud). */
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Is analytics configured? True only when a PostHog key is present. This is the
 * single gate the provider/hook use to decide whether to do anything at all.
 * (Consent is a SEPARATE, additional gate enforced at init/capture time.)
 */
export function isAnalyticsEnabled(): boolean {
  return Boolean(env.NEXT_PUBLIC_POSTHOG_KEY);
}

/** The PostHog project key, or `undefined` when analytics is disabled. */
export function analyticsKey(): string | undefined {
  return env.NEXT_PUBLIC_POSTHOG_KEY;
}

/** The configured PostHog host, defaulting to the US cloud ingestion host. */
export function analyticsHost(): string {
  return env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST;
}

/**
 * The CSP `connect-src` origins PostHog needs — but ONLY when analytics is
 * actually enabled (a key is set). When disabled this returns an empty array so
 * the production CSP is NOT broadened for a feature that will never connect.
 *
 * Returns the origin (scheme + host) of the configured host. PostHog also serves
 * assets/feature-flags from the same origin, so a single `connect-src` origin
 * covers the network calls the browser SDK makes.
 */
export function analyticsConnectSrc(): string[] {
  if (!isAnalyticsEnabled()) return [];
  try {
    return [new URL(analyticsHost()).origin];
  } catch {
    // A malformed host should never crash the proxy/CSP build — just contribute
    // nothing rather than an invalid source.
    return [];
  }
}
