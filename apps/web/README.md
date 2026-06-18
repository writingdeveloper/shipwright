# web — shipwright reference app

The dogfood target for [shipwright](../../README.md): a small but complete
**Tasks** MVP that exercises the extracted `@repo/*` packages end to end.

- **Auth** — email + password sign-up / sign-in via `@repo/auth` (Better Auth).
- **Tasks** — per-user task CRUD (add / toggle / delete) on a protected
  `/dashboard`, persisted with `@repo/db` (Drizzle + libSQL).
- **Security posture** — auth is verified *inside* every Server Action and the
  data layer scopes every read/write by `userId` (defence in depth), not just
  middleware. `@repo/db`'s Vitest suite proves the ownership invariants.

It is a reference, not a product: features are kept minimal so the patterns
(extract-from-usage, server-side authz, validated env) stay legible.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/sign-up`, `/sign-in` | Better Auth email/password forms |
| `/dashboard` | Protected task list (redirects to `/sign-in` when signed out) |
| `/api/auth/[...all]` | Better Auth route handlers (from `@repo/auth/next`) |

## Getting started

Run everything from the repo root with pnpm (Turborepo wires the workspace).

1. **Environment.** Copy the example and fill it in. Values are validated by
   `@repo/env` at build/startup, so a missing or malformed required var fails
   fast with a clear error.

   ```sh
   cp apps/web/.env.example apps/web/.env
   # BETTER_AUTH_SECRET must be >= 32 chars — generate one:
   #   openssl rand -base64 32
   ```

2. **Create the database.** Applies the Drizzle schema to the local libSQL file
   (`DATABASE_URL`, default `file:local.db`).

   ```sh
   pnpm --filter @repo/db db:push
   ```

3. **Develop.** Starts Next.js on http://localhost:3000.

   ```sh
   pnpm dev --filter=web
   ```

## Testing

- **Unit (Vitest).** Pure, framework-free logic (e.g. title validation):

  ```sh
  pnpm test --filter=web
  ```

- **End-to-end (Playwright).** Builds a real production server on port 3100
  against a throwaway temp database and drives the full sign-up → add → toggle →
  delete → sign-out → sign-in flow. It manages its own DB and secrets (see
  `playwright.config.ts`), so no `.env` is required for e2e.

  ```sh
  pnpm test:e2e          # from repo root
  # first run only, to fetch the browser:
  pnpm -C apps/web exec playwright install --with-deps chromium
  ```

## Build

```sh
pnpm build --filter=web
# Secret-less build (type-check / CI) — skips env validation:
SKIP_ENV_VALIDATION=true pnpm build --filter=web
```
