import { defineConfig } from "drizzle-kit";

// drizzle-kit loads this file with its own esbuild bundler OUTSIDE Next.js, so
// it deliberately does NOT import `@repo/env` (a `@t3-oss/env-nextjs` module).
// It reads `DATABASE_URL` directly with the same `file:local.db` default the
// validated schema applies, so `db:push` works standalone and in CI/e2e where
// only `DATABASE_URL` is exported.
const DATABASE_URL = process.env.DATABASE_URL ?? "file:local.db";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
