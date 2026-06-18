# @repo/env — Claude Code rules

Type-safe environment via `@t3-oss/env-nextjs` + Zod. The single source of truth for env vars.

- **Never read `process.env` elsewhere** — import `env` from `@repo/env` (re-exported by `apps/web/env.ts`). Server vars are server-only by type; client vars must be `NEXT_PUBLIC_*`.
- Add a var: declare it in the `server`/`client` block, add it to `runtimeEnv`, and to `apps/web/.env.example`.
- **`SKIP_ENV_VALIDATION` skips Zod defaults too** — under it, a defaulted var like `DATABASE_URL` becomes `undefined`. Use it only for type-only checks; for CI builds pass schema-valid placeholder env instead (see `.github/workflows/ci.yml`).
