import type { NextConfig } from "next";

// Validate env once at build/startup (same pattern as apps/web/next.config.ts).
import "./env";

const nextConfig: NextConfig = {
  // Transpile shared `@repo/*` source (they ship TS/JSX, not a build). Add other
  // `@repo/*` packages here as this app starts consuming them.
  transpilePackages: ["@repo/auth", "@repo/db", "@repo/env", "@repo/ui"],
  // @repo/db uses @libsql/client (Node-native); keep it + libsql external to the
  // server bundle, the same reason apps/web does.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
