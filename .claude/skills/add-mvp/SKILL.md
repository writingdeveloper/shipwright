---
name: add-mvp
description: Scaffold a new Next.js app (a new MVP) in the monorepo, wired to the shared design system
---

# Add a new MVP app

Use the repo generator — don't hand-create app files.

- Interactive: `pnpm gen app`
- Non-interactive: `pnpm gen app --args <kebab-name> <port> <pwa>` — all three args are required; omitting `<pwa>` drops plop into an interactive confirm that hangs forever with no TTY. Use a free port, e.g. `3400` (3000/3100/3200/3300 are taken by web + admin). `<pwa>` is `true` or `false`.

This scaffolds `apps/<name>/` as a minimal Next.js 16 App-Router app already wired to `@repo/ui` (imports `globals.css`, `@source` scanning, `transpilePackages`). Then run `pnpm install`, and `pnpm --filter <name> dev`.

Wire shared concerns (`@repo/auth`, `@repo/db`, `@repo/env`, …) into the new app **as it needs them** — extract recurring patterns back into `@repo/*`, don't pre-stub.
