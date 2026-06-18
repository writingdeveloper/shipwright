---
name: add-mvp
description: Scaffold a new Next.js app (a new MVP) in the monorepo, wired to the shared design system
---

# Add a new MVP app

Use the repo generator — don't hand-create app files.

- Interactive: `pnpm gen app`
- Non-interactive: `pnpm gen app --args <kebab-name> <port>` (port defaults to 3200; keep it off 3000/3100 which the reference app + e2e use)

This scaffolds `apps/<name>/` as a minimal Next.js 16 App-Router app already wired to `@repo/ui` (imports `globals.css`, `@source` scanning, `transpilePackages`). Then run `pnpm install`, and `pnpm --filter <name> dev`.

Wire shared concerns (`@repo/auth`, `@repo/db`, `@repo/env`, …) into the new app **as it needs them** — extract recurring patterns back into `@repo/*`, don't pre-stub.
