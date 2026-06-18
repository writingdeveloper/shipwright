import type { NextConfig } from "next";
import { securityHeaders } from "@repo/config/headers";
import { withObservabilityConfig } from "@repo/observability/next-config";

// Importing the app's env module here validates environment variables once, at
// build/startup, so a missing or malformed var fails fast instead of surfacing
// as a runtime 500 (honours SKIP_ENV_VALIDATION for secret-less CI builds).
import "./env";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@repo/ui",
    "@repo/auth",
    "@repo/db",
    "@repo/env",
    "@repo/config",
    "@repo/seo",
    "@repo/legal",
    "@repo/email",
    "@repo/analytics",
    "@repo/observability",
    "@repo/security",
  ],
  serverExternalPackages: ["@libsql/client", "libsql"],

  // Static, request-independent security headers on every route. The
  // Content-Security-Policy is deliberately NOT here — it carries a per-request
  // nonce and is set in `proxy.ts` (the official Next.js nonce CSP pattern).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
};

// Compose Sentry's build wrapper AROUND the config above WITHOUT losing
// transpilePackages/headers/etc. With no SENTRY_DSN this returns `nextConfig`
// unchanged (no Sentry build instrumentation, no source-map upload, no failure);
// with a DSN it adds the Sentry plugin, uploading source maps only when
// SENTRY_AUTH_TOKEN + org + project are all present. See @repo/observability.
export default withObservabilityConfig(nextConfig);
