# @repo/db — Claude Code rules

Drizzle ORM + libSQL. Owns the schema (`src/schema.ts`: Better Auth tables + app tables) and the `db` client.

- Import the client + operators from this package, not `drizzle-orm`: `import { db, schema, task, eq, and, desc, sql } from "@repo/db"`. `drizzle-orm` stays an implementation detail.
- **Server-only** (libSQL can't run in the browser). Keep DB access in a server-only Data Access Layer; never touch `db` from client code.
- **Scope every mutation by owner**: `where(and(eq(table.id, id), eq(table.userId, userId)))` so a guessed id touches 0 rows. Owner-scope reads too.
- `DATABASE_URL` comes from `@repo/env` (defaults `file:local.db`; set a Turso URL + `DATABASE_AUTH_TOKEN` for remote). Both `src/client.ts` and `drizzle.config.ts` forward the token, so local↔Turso is config-only — no code change (same sqlite dialect).
- Apply schema: `pnpm --filter @repo/db db:push`. It runs with CWD=`packages/db`, so pass an ABSOLUTE `DATABASE_URL` to target the app's db file.
- **Provider docs live in `README.md`**: running on a local file vs. Turso, and the honest, file-by-file **swap-to-Postgres guide** (pg-core vs sqlite-core, `drizzle-orm/node-postgres`, drizzle `dialect: "postgresql"`, Better Auth adapter `provider: "pg"`). Postgres is NOT wired in today — the reference app is libSQL/SQLite only.
