import type { NextConfig } from "next";

// Importing the app's env module here validates environment variables once, at
// build/startup, so a missing or malformed var fails fast instead of surfacing
// as a runtime 500 (honours SKIP_ENV_VALIDATION for secret-less CI builds).
import "./env";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui", "@repo/auth", "@repo/db", "@repo/env"],
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
