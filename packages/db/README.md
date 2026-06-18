# @repo/db

Drizzle ORM over **libSQL** (the SQLite dialect). Owns the schema
(`src/schema.ts` — Better Auth tables + the app's `task` table) and the `db`
client. The same client and dialect drive **both** a local file and remote
**Turso**; this doc covers running on each, and an honest guide to swapping the
whole package to **Postgres**.

> Architecture rules live in `CLAUDE.md` (import the client from this package,
> keep DB access server-only, scope every mutation by owner). This file is about
> the **provider**: where the bytes live and how to change that.

## Two libSQL targets, one dialect

libSQL speaks SQLite whether the database is a local file or a hosted Turso
database, so switching between them is **configuration only — no code change**.
Both the runtime client and the migration tool already forward the auth token:

| | `DATABASE_URL` | `DATABASE_AUTH_TOKEN` |
| --- | --- | --- |
| Local file (default) | `file:local.db` | _(unset)_ |
| Turso (remote) | `libsql://<db>-<org>.turso.io` | _(required)_ |

The provider is chosen entirely by these two env vars, validated in `@repo/env`:

- `src/client.ts` (runtime) passes `{ url, authToken }` to `drizzle(...)`.
- `drizzle.config.ts` (drizzle-kit: `db:push` / `db:generate` / `db:studio`)
  forwards the same `authToken` when set.

### Local (zero-config)

A fresh clone runs with no setup — `DATABASE_URL` defaults to `file:local.db`.
Apply the schema:

```sh
pnpm --filter @repo/db db:push
```

> `db:push` runs with CWD = `packages/db`, so a relative `file:` path resolves
> there. To target the app's DB file, pass an **absolute** `DATABASE_URL`.

### Turso (remote, production)

[Turso](https://turso.tech) is hosted libSQL — first-class here, no adapter swap.

1. Create the DB and a token (Turso CLI):
   ```sh
   turso db create shipwright
   turso db show shipwright --url        # -> libsql://shipwright-<org>.turso.io
   turso db tokens create shipwright     # -> the auth token
   ```
2. Set both vars (see `apps/web/.env.example`):
   ```sh
   DATABASE_URL=libsql://shipwright-<org>.turso.io
   DATABASE_AUTH_TOKEN=<token>
   ```
3. Push the schema to Turso (the config forwards the token automatically):
   ```sh
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm --filter @repo/db db:push
   ```

That's the whole switch. Better Auth's adapter still uses `provider: "sqlite"`
because Turso **is** SQLite on the wire.

## Swapping to Postgres (honest guide)

The reference app ships **libSQL/SQLite only** — Postgres is **not** wired in (no
dual-dialect, deliberately, to keep the reference app lean). Moving this package
to Postgres (e.g. Neon, Supabase, RDS) is a real but bounded change. Every edit:

1. **Dependencies** (`packages/db/package.json`): replace the libSQL stack with
   the Postgres one.
   - remove `@libsql/client`; add `pg` (and `@types/pg` as a dev dep).
   - `drizzle-orm` and `drizzle-kit` stay (they support both dialects).
   - In `apps/web/next.config.ts`, drop `@libsql/client` / `libsql` from
     `serverExternalPackages` (add `pg` only if the bundler complains).

2. **Schema** (`src/schema.ts`): switch the table builder from `sqlite-core` to
   `pg-core` and map column types. SQLite has no native boolean/timestamp, so the
   `{ mode: ... }` integer columns become real Postgres types:
   - `import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core"`
   - `sqliteTable(...)` → `pgTable(...)`
   - `integer(col, { mode: "boolean" })` → `boolean(col)`
   - `integer(col, { mode: "timestamp_ms" })` → `timestamp(col, { withTimezone: true })`
   - drop the SQLite `unixepoch(...)` SQL defaults; use `.defaultNow()` for
     timestamps. `crypto.randomUUID()` `$defaultFn` works unchanged (or use
     `uuid("id").defaultRandom()`).
   - **Regenerate the Better Auth tables** for Postgres instead of hand-porting:
     `pnpm --filter @repo/db exec @better-auth/cli generate` resolves the
     `@repo/auth` config and emits the correct `pg-core` columns.

3. **Client** (`src/client.ts`): swap the driver.
   - `import { drizzle } from "drizzle-orm/node-postgres"` (instead of
     `drizzle-orm/libsql`).
   - construct it from a `pg` `Pool`/connection string:
     `drizzle({ connection: env.DATABASE_URL, schema })` — drop `authToken`
     (Postgres auth is in the connection string / TLS, not a separate token).

4. **drizzle-kit** (`drizzle.config.ts`): `dialect: "sqlite"` → `dialect: "postgresql"`,
   and `dbCredentials: { url: DATABASE_URL }` (no `authToken`).

5. **Better Auth adapter** (`packages/auth/src/server.ts`): the Drizzle adapter's
   `provider: "sqlite"` → `provider: "pg"`.

6. **Env** (`packages/env/src/index.ts` + `.env.example`): `DATABASE_URL` becomes
   a `postgres://…` URL (and there's no `DATABASE_AUTH_TOKEN` — remove it or leave
   it optional/unused).

7. **Tests** (`test/helpers.ts`): the data-layer tests create a fresh **libSQL**
   file per run; point them at a disposable Postgres (a test container or a
   throwaway schema) and update the client import.

After those edits, `pnpm --filter @repo/db db:push` provisions Postgres and the
rest of the app is dialect-agnostic (it imports `db` + operators from `@repo/db`,
never `drizzle-orm` directly — which is exactly why the blast radius is this one
package plus the auth adapter line).
