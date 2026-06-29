# @repo/db — Claude Code rules

Drizzle ORM + libSQL. Owns the schema (`src/schema.ts`: Better Auth tables + app tables) and the `db` client.

- Import the client + operators from this package, not `drizzle-orm`: `import { db, schema, task, eq, and, desc, sql } from "@repo/db"`. `drizzle-orm` stays an implementation detail.
- **Server-only** (libSQL can't run in the browser). Keep DB access in a server-only Data Access Layer; never touch `db` from client code.
- **Scope every owner-table query with the helpers**: use `ownedBy(table, userId)`
  (list reads) and `ownedRow(table, userId, id)` (single-row read/update/delete)
  from `@repo/db` instead of hand-writing `and(eq(id), eq(userId))`. This is
  enforced: the `no-unscoped-owner-table` ESLint rule fails the build if a
  `.from`/`.delete`/`.update` on an owner table (`task`, `uploadedFile`,
  `pushSubscription`, `subscription`) references no scope helper, and
  `test/owner-scope.test.ts` proves cross-user isolation for every table in
  `OWNER_TABLES`. Adding an owner table: add it to `OWNER_TABLES`
  (`src/owner-scope.ts`), to the rule's `tables` option
  (`@repo/eslint-config/base.js`), and to the invariant test's CASES. Inserts need
  no helper — `userId` is `.notNull()`, so omitting it is already a TS + runtime
  error.
- **Admin reads that span owners** use `acrossAllOwners()` — a greppable,
  lint-recognised seam. It carries NO role check yet (that lands with the RBAC
  item); until then it is used only by the invariant test.
- `DATABASE_URL` comes from `@repo/env` (defaults `file:local.db`; set a Turso URL + `DATABASE_AUTH_TOKEN` for remote). Both `src/client.ts` and `drizzle.config.ts` forward the token, so local↔Turso is config-only — no code change (same sqlite dialect).
- Apply schema: `pnpm --filter @repo/db db:push`. It runs with CWD=`packages/db`, so pass an ABSOLUTE `DATABASE_URL` to target the app's db file.
- **Provider docs live in `README.md`**: running on a local file vs. Turso, and the honest, file-by-file **swap-to-Postgres guide** (pg-core vs sqlite-core, `drizzle-orm/node-postgres`, drizzle `dialect: "postgresql"`, Better Auth adapter `provider: "pg"`). Postgres is NOT wired in today — the reference app is libSQL/SQLite only.
- **The Postgres swap path is CI-tested, not just documented.** `src/schema.pg.ts`, `src/client.pg.ts`, `drizzle.config.pg.ts`, and `test/**/*.pg.test.ts` are a faithful pg-core mirror of the libSQL files; the `.github/workflows/pg-compat.yml` job applies `schema.pg.ts` to a real Postgres 16 and runs the ownership invariants on every push/PR. **Keep them in lockstep**: any change to `src/schema.ts` must be mirrored in `src/schema.pg.ts` (the pg suite goes red on drift). They are parallel files — nothing in `apps/web` imports the `.pg` variants, so the libSQL runtime/bundle is unaffected.
