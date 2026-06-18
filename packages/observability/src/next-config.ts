import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

import { env } from "@repo/env";

import { isSentryEnabled } from "./config";

/**
 * @repo/observability — compose `withSentryConfig` AROUND an existing Next config
 * WITHOUT dropping anything the app already set (`transpilePackages`,
 * `serverExternalPackages`, `headers()`, …). The app calls this LAST in
 * `next.config.ts`:
 *
 *   export default withObservabilityConfig(nextConfig);
 *
 * GRACEFUL DEGRADATION — two independent guards so the build NEVER fails without
 * Sentry env:
 *
 * 1. NO DSN ⇒ return the original config UNCHANGED. `withSentryConfig` is not
 *    applied at all, so there is zero Sentry build instrumentation when the
 *    feature is off. The runtime init helpers are likewise no-ops, so the SDK is
 *    fully inert.
 *
 * 2. DSN but NO `SENTRY_AUTH_TOKEN` (the common CI case) ⇒ still wrap, but skip
 *    source-map UPLOAD. `withSentryConfig` only uploads when org+project+token
 *    are present; we pass them únicamente when all exist, and set
 *    `sourcemaps.disable` otherwise, so a missing token can never make the build
 *    error out trying to authenticate — it just ships without uploaded maps.
 *
 * The Sentry webpack/turbopack plugin is also told to stay silent and to no-op
 * cleanly, keeping `next build` output clean in the disabled/tokenless paths.
 */
export function withObservabilityConfig(nextConfig: NextConfig): NextConfig {
  // Guard 1: no DSN ⇒ do not touch the config at all.
  if (!isSentryEnabled()) {
    return nextConfig;
  }

  const authToken = env.SENTRY_AUTH_TOKEN;
  const org = env.SENTRY_ORG;
  const project = env.SENTRY_PROJECT;
  // Source maps can only be uploaded with all three of org + project + token.
  const canUploadSourcemaps = Boolean(authToken && org && project);

  return withSentryConfig(nextConfig, {
    // Identify the project for source-map upload; harmless when upload is off.
    org,
    project,
    authToken,

    // Quiet the plugin so the disabled/tokenless build output stays clean.
    silent: true,

    // Guard 2: only upload source maps when fully credentialed; otherwise
    // disable upload so a missing token never fails the build.
    sourcemaps: {
      disable: !canUploadSourcemaps,
    },

    // Route the browser SDK's requests through a same-origin tunnel to dodge
    // ad-blockers. Same-origin, so it needs no CSP `connect-src` change.
    tunnelRoute: "/monitoring",

    // Tree-shake Sentry logger statements out of the client bundle in prod.
    disableLogger: true,

    // Do not emit the optional Vercel Cron monitoring instrumentation.
    automaticVercelMonitors: false,
  });
}
