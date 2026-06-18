---
name: add-package
description: Scaffold a new shared @repo/* package in the monorepo using the turbo generator
---

# Add a shared package

Use the repo generator instead of hand-creating package files.

- Interactive: `pnpm gen package`
- Non-interactive: `pnpm gen package --args <kebab-name>`

This scaffolds `packages/<name>/` (`@repo/<name>`) matching repo conventions (`exports` → `src/index.ts`, shared tsconfig/eslint). After generating: `pnpm install` to link the workspace, then `pnpm --filter @repo/<name> check-types`.

Discipline: add a package only when it has a real consumer — extract recurring code from an app, don't create empty speculative packages.
