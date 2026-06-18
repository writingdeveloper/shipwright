import { defineConfig } from "drizzle-kit";

// drizzle-kit loads this file with its own esbuild bundler OUTSIDE Next.js, so
// it deliberately does NOT import `@repo/env` (a `@t3-oss/env-nextjs` module).
// It reads `DATABASE_URL` directly with the same `file:local.db` default the
// validated schema applies, so `db:push` works standalone and in CI/e2e where
// only `DATABASE_URL` is exported.
const DATABASE_URL = process.env.DATABASE_URL ?? "file:local.db";

// Optional Turso auth token. For a local `file:` DB it stays unset; for a remote
// `libsql://` (Turso) DB it must be forwarded so `db:push`/`db:generate`/`studio`
// can authenticate — the runtime client (src/client.ts) forwards it too.
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DATABASE_URL,
    // drizzle-kit accepts an optional authToken for libSQL/Turso; omit it for
    // local files so nothing changes for the default zero-config path.
    ...(DATABASE_AUTH_TOKEN ? { authToken: DATABASE_AUTH_TOKEN } : {}),
  },
});
