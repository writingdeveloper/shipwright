/**
 * @repo/analytics — consent-gated PostHog analytics for the Next.js App Router.
 *
 * Surfaces (also importable via subpaths):
 * - `@repo/analytics/provider` → `<PostHogProvider>` client component. Wrap the
 *   app once. NO-OP when `NEXT_PUBLIC_POSTHOG_KEY` is unset, and even with a key
 *   it does not initialise posthog until the user accepts cookies (via
 *   `@repo/legal`'s consent). Default = no tracking.
 * - `@repo/analytics/client` → `useAnalytics()` hook: `capture`/`identify`/`reset`
 *   that no-op until analytics is live.
 * - `@repo/analytics/config` → pure `isAnalyticsEnabled()`, `analyticsHost()`,
 *   `analyticsConnectSrc()` — used by the proxy to extend the CSP `connect-src`
 *   ONLY when a key is set, and unit-tested in isolation.
 * - `@repo/analytics/server` → optional `captureServerEvent(...)` (posthog-node)
 *   for deliberate server-side events; kept on its own subpath so posthog-node
 *   never reaches the client bundle.
 *
 * The provider/hook are client components (`"use client"`); the config is pure
 * and server-safe. The server helper is intentionally NOT re-exported here to
 * keep posthog-node out of client bundles — import it from `@repo/analytics/server`.
 */

export {
  PostHogProvider,
  useAnalyticsContext,
  type PostHogProviderProps,
} from "./provider";

export { useAnalytics } from "./use-analytics";

export {
  isAnalyticsEnabled,
  analyticsKey,
  analyticsHost,
  analyticsConnectSrc,
  isGoogleAnalyticsEnabled,
  googleAnalyticsId,
  gaConnectSrc,
  DEFAULT_POSTHOG_HOST,
} from "./config";

export { GoogleAnalytics } from "./google-analytics";
