import type { NextConfig } from "next";

import { securityHeaders } from "@repo/config/headers";

// Validate env once at build/startup (same pattern as apps/web/next.config.ts).
import "./env";

const nextConfig: NextConfig = {
  // Transpile shared `@repo/*` source (they ship TS/JSX, not a build). Add other
  // `@repo/*` packages here as this app starts consuming them.
  transpilePackages: [
    "@repo/auth",
    "@repo/config",
    "@repo/db",
    "@repo/env",
    "@repo/observability",
    "@repo/payments",
    "@repo/security",
    "@repo/ui",
  ],
  // @repo/db uses @libsql/client (Node-native); keep it + libsql external to the
  // server bundle, the same reason apps/web does.
  serverExternalPackages: ["@libsql/client", "libsql"],

  // Static, request-independent security headers on every route. The per-request
  // nonce CSP is set in `proxy.ts` (the Next.js nonce CSP pattern), NOT here —
  // the same split apps/web uses.
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
};

export default nextConfig;
