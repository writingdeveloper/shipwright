import path from "node:path";

import type { NextConfig } from "next";
import { securityHeaders } from "@repo/config/headers";
import { withObservabilityConfig } from "@repo/observability/next-config";

// Importing the app's env module here validates environment variables once, at
// build/startup, so a missing or malformed var fails fast instead of surfacing
// as a runtime 500 (honours SKIP_ENV_VALIDATION for secret-less CI builds).
import "./env";

const nextConfig: NextConfig = {
  // Self-contained server bundle for container/VPS hosts (Docker → Coolify, Fly,
  // any Node runtime). `next build` emits `.next/standalone` with a minimal
  // `server.js` + only the traced `node_modules`, so the runtime image needs no
  // `pnpm install`. Harmless on Vercel (ignored) and for `next dev`/`next start`,
  // so it stays on unconditionally. See DEPLOY.md.
  output: "standalone",
  // In a monorepo the file-tracer must walk UP to the workspace root to collect
  // the linked `@repo/*` packages and hoisted `node_modules`; without this Next
  // infers the app dir and ships an incomplete standalone bundle. Next always
  // runs the build with cwd = this app dir (turbo, the Playwright webServer, and
  // the Dockerfile all do), so the repo root is two levels up. `process.cwd()`
  // is used instead of `import.meta.url` because Next compiles this config to
  // CommonJS (`next.config.compiled.js`), where `import.meta` is unavailable.
  outputFileTracingRoot: path.join(process.cwd(), "..", ".."),

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
    "@repo/pwa",
  ],
  serverExternalPackages: ["@libsql/client", "libsql", "web-push"],

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
