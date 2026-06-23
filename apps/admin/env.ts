// Re-export the shared, validated env so this app imports `env` from a local
// module (same pattern as apps/web/env.ts). Importing this in next.config.ts
// validates environment variables once at build/startup.
export { env } from "@repo/env";
