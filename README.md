# shipwright

> An AI-native, modular, **own-it** Next.js + Turborepo starter for shipping many MVPs fast.

**shipwright** is an open-source monorepo starter you *assemble and own* — not a paid SaaS boilerplate you rent, and not a black box you fork. You wire vetted libraries (Next.js, Drizzle, Better Auth, Stripe, shadcn/ui) into your own structure, pick features at install time, and ship products from it.

> ⚠️ **Status: early / work in progress.** Built in the open by dogfooding it on real apps — packages are *extracted from actual usage*, not pre-invented.

## Why another starter?

Three things most starters don't do:

1. **AI-native.** First-class Claude Code support ships *in the repo*: a curated root `CLAUDE.md` (with a convention for per-package `CLAUDE.md` files as packages need them) and a `.claude/` directory (skills, subagents, settings). The repo is built to be driven by an AI coding agent.
2. **Modular, opt-in.** Pick the features you want at scaffold time (auth, payments, analytics, PWA…) instead of inheriting a fixed all-in-one app. _(Planned via `turbo gen`.)_
3. **You own it.** Assembled from vetted libraries on the bare official `create-turbo` skeleton — no vendor lock-in, no per-seat fees, no someone-else's-opinions you can't remove.

## Stack (default presets — all swappable)

Because packages are **extracted from real usage**, not pre-invented, the table
below is honest about what ships *today* vs. what's planned. `Status` reflects
the current `main`:

| Concern | Default | Status |
| --- | --- | --- |
| Framework | Next.js (App Router) + React | ✅ In repo |
| Monorepo | Turborepo + pnpm | ✅ In repo |
| UI | shadcn/ui + Tailwind | ✅ In repo (`@repo/ui`) |
| Auth | Better Auth (self-hosted, no per-MAU fee) | ✅ In repo (`@repo/auth`) |
| DB / ORM | Drizzle (libSQL/SQLite — local file or Turso) | ✅ In repo (`@repo/db`); Postgres = documented swap |
| Env validation | `@t3-oss/env-nextjs` + Zod | ✅ In repo (`@repo/env`) |
| API | tRPC | 🔜 Planned |
| Payments | Stripe | 🔜 Planned |
| Email | Resend + React Email | 🔜 Planned |
| Analytics / errors | PostHog | 🔜 Planned |
| Observability | Sentry + Better Stack | 🔜 Planned |

✅ = present and dogfooded in `apps/web` today. 🔜 = a planned preset, not yet in
the repo. Nothing here is mandatory — the install-time CLI (also planned) will
let you include only what you need, and every choice is a swappable preset.

## Structure

```text
apps/
  web/                 # reference app (the dogfood target): Tasks MVP
packages/
  ui/                  # @repo/ui — shared shadcn/ui design system
  auth/                # @repo/auth — Better Auth (server + client + Next handler)
  db/                  # @repo/db — Drizzle schema + libSQL client (local file or Turso)
  env/                 # @repo/env — type-safe env schema (t3-env + Zod)
  config/              # @repo/config — security headers + nonce-based CSP helpers
  eslint-config/       # @repo/eslint-config
  typescript-config/   # @repo/typescript-config
.claude/               # AI-native layer: skills, agents, settings
CLAUDE.md              # repo-wide guidance for Claude Code
```

Cross-cutting concerns (auth, db, payments, seo, email, observability…) become `@repo/*` packages **as the reference app needs them** — extracted from real usage, not pre-stubbed.

## Getting started

```sh
pnpm install
pnpm dev
```

Or scaffold a fresh project from this starter with the CLI:

```sh
npx create-shipwright my-app
```

## Deploying

See **[DEPLOY.md](./DEPLOY.md)** for host-agnostic recipes — Docker (Coolify /
VPS / any container host, via Next.js standalone output), Vercel, and Cloudflare
(OpenNext) — plus the env vars each needs, applying the schema to a prod Turso
DB, and the Stripe webhook.

## Roadmap

- [x] First reference app (`apps/web`) with auth + db (Tasks MVP: sign-up/in, per-user task CRUD, protected dashboard)
- [x] Extract `@repo/{auth,db,env}` from it
- [ ] Extract `@repo/api` (tRPC) from the reference app
- [ ] `@repo/seo`, `@repo/legal` (jurisdiction-agnostic: GDPR / CCPA / PIPA presets)
- [ ] Optional `@repo/pwa` module (manifest + service worker + web-push)
- [ ] `turbo gen` install-time feature picker
- [x] `create-shipwright` CLI (`packages/create-shipwright`) — in repo; npm publish wired via Changesets
- [x] Host-agnostic deploy recipes (Docker / Vercel / Cloudflare) + `DEPLOY.md`

## License

[MIT](./LICENSE) © Si Hyeong Lee
