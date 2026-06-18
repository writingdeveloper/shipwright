# shipwright

> An AI-native, modular, **own-it** Next.js + Turborepo starter for shipping many MVPs fast.

**shipwright** is an open-source monorepo starter you *assemble and own* — not a paid SaaS boilerplate you rent, and not a black box you fork. You wire vetted libraries (Next.js, Drizzle, Better Auth, Stripe, shadcn/ui) into your own structure, pick features at install time, and ship products from it.

> ⚠️ **Status: early / work in progress.** Built in the open by dogfooding it on real apps — packages are *extracted from actual usage*, not pre-invented.

## Why another starter?

Three things most starters don't do:

1. **AI-native.** First-class Claude Code support ships *in the repo*: a curated root `CLAUDE.md`, per-package `CLAUDE.md` conventions, and a `.claude/` directory (skills, subagents, settings). The repo is built to be driven by an AI coding agent.
2. **Modular, opt-in.** Pick the features you want at scaffold time (auth, payments, analytics, PWA…) instead of inheriting a fixed all-in-one app. _(Planned via `turbo gen`.)_
3. **You own it.** Assembled from vetted libraries on the bare official `create-turbo` skeleton — no vendor lock-in, no per-seat fees, no someone-else's-opinions you can't remove.

## Stack (default presets — all swappable)

| Concern | Default |
| --- | --- |
| Framework | Next.js (App Router) + React |
| Monorepo | Turborepo + pnpm |
| UI | shadcn/ui + Tailwind |
| Auth | Better Auth (self-hosted, no per-MAU fee) |
| DB / ORM | Drizzle |
| API | tRPC |
| Payments | Stripe |
| Email | Resend + React Email |
| Analytics / errors | PostHog |
| Observability | Sentry + Better Stack |

Nothing here is mandatory — the install-time CLI lets you include only what you need, and every choice is a swappable preset.

## Structure

```text
apps/
  web/                 # reference app (the dogfood target)
packages/
  ui/                  # @repo/ui — shared shadcn/ui design system
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

## Roadmap

- [ ] First reference app (`apps/web`) with auth + db
- [ ] Extract `@repo/{auth,db,api}` from it
- [ ] `@repo/seo`, `@repo/legal` (jurisdiction-agnostic: GDPR / CCPA / PIPA presets)
- [ ] Optional `@repo/pwa` module (manifest + service worker + web-push)
- [ ] `turbo gen` install-time feature picker
- [ ] `create-shipwright` CLI on npm

## License

[MIT](./LICENSE) © Si Hyeong Lee
