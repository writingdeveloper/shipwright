/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/ui", "@repo/auth", "@repo/db"],
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
