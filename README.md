# shipwright

> An AI-native, modular, **own-it** Next.js + Turborepo starter for shipping many MVPs fast.

**shipwright** is an open-source monorepo starter you *assemble and own* — not a paid SaaS boilerplate you rent, and not a black box you fork. You wire vetted libraries (Next.js, Drizzle, Better Auth, Stripe, shadcn/ui) into your own structure, pick features at install time, and ship products from it.

> ⚠️ **Status: early / work in progress.** Built in the open by dogfooding it on real apps — packages are *extracted from actual usage*, not pre-invented.

## Why another starter?

Three things most starters don't do:

1. **AI-native.** First-class Claude Code support ships *in the repo*: a curated root `CLAUDE.md` (with a convention for per-package `CLAUDE.md` files as packages need them) and a `.claude/` directory (skills, subagents, settings). The repo is built to be driven by an AI coding agent.
2. **Modular, opt-in.** Scaffold new apps and shared packages with `pnpm gen app` / `pnpm gen package` (Turborepo generators) — compose only what you need instead of inheriting a fixed all-in-one app. Every integration gracefully no-ops until you add its key.
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
| Security | nonce CSP + security headers | ✅ In repo (`@repo/config`) |
| Rate limiting | in-memory / Upstash | ✅ In repo (`@repo/security`) |
| Payments | Stripe (checkout + idempotent webhooks) | ✅ In repo (`@repo/payments`) |
| Email | Resend + React Email | ✅ In repo (`@repo/email`) |
| Analytics | PostHog (consent-gated) | ✅ In repo (`@repo/analytics`) |
| Observability | Sentry + structured logger | ✅ In repo (`@repo/observability`) |
| SEO / GEO | metadata · sitemap · robots (AI crawlers) · JSON-LD (Article/FAQ/Breadcrumb) · llms.txt · OG image · Search Console | ✅ In repo (`@repo/seo`) |
| Legal | privacy / ToS / cookie consent | ✅ In repo (`@repo/legal`) |
| PWA | manifest + service worker + web-push | ✅ In repo (`@repo/pwa`) |
| API style | Server Actions (+ optional tRPC) | ✅ Server Actions + tRPC (`@repo/api`) |

✅ = wired into `apps/web` today (the third-party integrations gracefully no-op
until you add their API key, so the app, tests, and CI run with zero accounts).
🔜 = optional. Scaffold new apps/packages with `pnpm gen`, and every choice is a
swappable preset.

## Structure

```text
apps/
  web/                 # reference app (the dogfood target): Tasks MVP
packages/
  ui/ auth/ db/ env/   # design system · Better Auth · Drizzle/libSQL · validated env
  config/              # @repo/config — security headers + nonce CSP
  security/            # @repo/security — rate limiting (in-memory / Upstash)
  payments/            # @repo/payments — Stripe checkout + idempotent webhooks
  email/               # @repo/email — Resend + React Email
  analytics/           # @repo/analytics — PostHog (consent-gated)
  observability/       # @repo/observability — Sentry + structured logger
  seo/ legal/          # metadata/sitemap/robots/JSON-LD · privacy/ToS/cookie consent
  pwa/                 # @repo/pwa — manifest + service worker + web-push
  api/                 # @repo/api — opt-in tRPC layer (TanStack React Query)
  create-shipwright/   # the `npx create-shipwright` scaffolder
  eslint-config/ typescript-config/   # shared tooling
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
- [x] Extract `@repo/{auth,db,env,config,security,payments,email,analytics,observability,seo,legal}` from it
- [x] `turbo gen` scaffolding (`pnpm gen app` / `pnpm gen package`) + AI-native `.claude/` layer
- [x] CI (lint/types/build/test/e2e/audit), nonce CSP + security headers, rate limiting
- [x] Optional `@repo/pwa` module (manifest + service worker + web-push)
- [x] Optional `@repo/api` (tRPC) — opt-in, alongside Server Actions
- [x] `create-shipwright` CLI (`packages/create-shipwright`) — in repo; npm publish wired via Changesets
- [x] Host-agnostic deploy recipes (Docker / Vercel / Cloudflare) + `DEPLOY.md`

## License

[MIT](./LICENSE) © Si Hyeong Lee
