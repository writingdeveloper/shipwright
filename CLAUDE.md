# shipwright — guidance for Claude Code

AI-native, modular, own-it Next.js + Turborepo starter for shipping many MVPs. This file is loaded every session — keep it broadly-applicable; put task-specific expertise in `.claude/skills/`.

## Repo map
- `apps/web` — the reference app we dogfood the starter on (Tasks MVP: auth + per-user task CRUD).
- `packages/ui` (`@repo/ui`) — shared shadcn/ui design system.
- `packages/auth` (`@repo/auth`) — Better Auth server/client/Next handler.
- `packages/db` (`@repo/db`) — Drizzle schema + libSQL client.
- `packages/env` (`@repo/env`) — type-safe env schema (`@t3-oss/env-nextjs` + Zod); apps compose it in a root `env.ts`.
- `packages/eslint-config`, `packages/typescript-config` — shared tooling configs.
- `.claude/` — skills, subagents, settings (the AI-native layer).
- Several packages ship their own `CLAUDE.md` for area-specific rules (`@repo/auth`, `@repo/db`, `@repo/ui`, `@repo/env`); this root file holds repo-wide rules + pointers. Add one to a package when it accrues enough local rules to warrant it.

## Conventions
- Package manager: **pnpm**. Monorepo: **Turborepo**.
- Internal packages use the `@repo/*` namespace via `workspace:*`; compile with `tsc` (Turborepo caches outputs).
- TypeScript everywhere, strict.
- Run tasks via turbo: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm check-types`. Filter with `--filter=web`.

## Architecture rules (don't violate)
- **Auth/authz: verify inside each Server Action** — do NOT rely on middleware / layout / page checks alone. Move DB access to a `server-only` Data Access Layer.
- **CSP is opt-in** — add it via nonce-based middleware (a `@repo/config` concern); it is not a framework default.
- **Env**: validation schemas live in the package that owns the vars; each app composes them in a root `env.ts` (zod + `@t3-oss/env-nextjs`).
- **Payment webhooks**: verify the signature, dedupe by event id (idempotency), return 2xx fast then process async, never depend on event ordering.
- **Compliance is jurisdiction-agnostic**: a future `@repo/legal` ships GDPR / CCPA / PIPA presets — never hardcode one country.

## The discipline (important)
This starter IS the deliverable — but grow it by **extracting validated patterns from `apps/web` into `@repo/*`**, NOT by pre-creating empty abstraction packages. If a package has no real consumer yet, don't create it. Own structure / conventions / glue; adopt vetted libraries for auth / ORM / payments / crypto — never hand-roll those.

## Pointers
- Reusable task workflows → `.claude/skills/`
- Custom subagents → `.claude/agents/`
- Permissions / hooks → `.claude/settings.json`
