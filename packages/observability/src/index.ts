/**
 * @repo/observability — structured logging + Sentry error monitoring for the
 * Next.js App Router, with graceful degradation when no Sentry DSN is set.
 *
 * Surfaces (also importable via subpaths):
 * - root (`@repo/observability`) → the always-on {@link logger} and the pure
 *   Sentry `config` predicates. These import NO Sentry code, so they are safe in
 *   any runtime (server, edge, browser, the proxy) and need no key.
 * - `@repo/observability/logger` → the structured `logger` on its own subpath.
 * - `@repo/observability/config` → pure `isSentryEnabled()`, `sentryConnectSrc()`,
 *   etc. — used by the proxy to extend the CSP `connect-src` ONLY when a DSN is
 *   set, and unit-tested in isolation.
 * - `@repo/observability/instrumentation` → `initSentryServer()` +
 *   `captureRequestError` for the app's `instrumentation.ts` (server + edge).
 * - `@repo/observability/client` → `initSentryClient()` + `onRouterTransitionStart`
 *   for the app's `instrumentation-client.ts` (browser).
 * - `@repo/observability/next-config` → `withObservabilityConfig(nextConfig)` to
 *   wrap `next.config.ts` with `withSentryConfig`, composed with the existing
 *   config and tolerant of a missing DSN / auth token.
 *
 * The Sentry init helpers and the next-config wrapper are kept on their own
 * subpaths (not re-exported here) so `@sentry/nextjs` never reaches a module that
 * only wanted the dependency-free logger.
 *
 * GRACEFUL DEGRADATION: with no `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, every
 * `Sentry.init` is skipped, `withObservabilityConfig` returns the config
 * untouched (no source-map upload, no build failure), and the CSP is not
 * broadened. The structured logger is ALWAYS active and needs no key.
 */

export {
  logger,
  setSentryBridge,
  type Logger,
  type LogLevel,
  type LogMeta,
  type SentryBridge,
} from "./logger";

export {
  isSentryEnabled,
  sentryDsn,
  publicSentryDsn,
  tracesSampleRate,
  sentryConnectSrc,
} from "./config";
