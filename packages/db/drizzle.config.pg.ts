import { defineConfig } from "drizzle-kit";

// POSTGRES sibling of `drizzle.config.ts` (libSQL). Used only by the
// `db:push:pg` / `pg-compat` CI path — the libSQL config stays the default.
//
// Like the libSQL config, this does NOT import `@repo/env` (drizzle-kit bundles
// it outside Next.js). It reads `DATABASE_URL` directly; the fallback is a local
// Postgres so `db:push:pg` is runnable standalone, and CI overrides it with the
// service-container URL.
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://localhost/shipwright_test";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.pg.ts",
  out: "./drizzle-pg",
  dbCredentials: { url: DATABASE_URL },
});
