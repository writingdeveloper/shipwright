import {
  initSentryClient,
  onRouterTransitionStart,
} from "@repo/observability/client";

/**
 * Next.js CLIENT instrumentation (Next 15/16), replacing
 * `sentry.client.config.ts`. This module runs in the BROWSER as the app boots.
 *
 * `initSentryClient()` initialises the browser Sentry SDK ONLY when
 * `NEXT_PUBLIC_SENTRY_DSN` is set; with no DSN it is a complete no-op, so the
 * browser opens no Sentry connection (and the proxy correspondingly leaves the
 * CSP `connect-src` unbroadened), keeping the e2e and a fresh clone unaffected.
 */
initSentryClient();

/**
 * Re-export Sentry's navigation hook so Next can instrument client-side route
 * transitions. Inert when Sentry is uninitialised (no DSN).
 */
export { onRouterTransitionStart };
