import type { NextConfig } from "next";
import { securityHeaders } from "@repo/config/headers";

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

export default nextConfig;
