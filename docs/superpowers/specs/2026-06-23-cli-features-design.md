# create-shipwright feature-selection + removal guide — Design & Plan

**Status:** approved 2026-06-23 · **Improvement:** #7 (final roadmap item)

## Goal

Let users scaffold with awareness of which optional features they want, and give
them an exact, current-shape guide to remove the rest. **Guide-first**: the
scaffold always ships the full starter (so it always builds), and selection drives
which per-feature **removal guides** are surfaced. Default (no flag / non-TTY) =
keep all → today's behavior exactly (zero regression).

## Why guide-first (not auto-patch)

The starter is designed so every integration **gracefully no-ops without its env
keys** — an unused package is already inert at runtime. So removal is a
*decluttering convenience*, not a correctness need. And auto-removal is unsafe:
`@repo/seo` (`createMetadata`), `@repo/observability/logger`, and `@repo/email`
(imported by **core** `@repo/auth`) are used across **22 app files** — deleting
those packages would dangle imports and break the build. Guide-first never
produces a broken scaffold and honours the "you own the code" philosophy. (Matches
the roadmap title literally: "feature-selection (prompts/flags) + per-package
removal guide".)

## Scope — what changes

ONLY: `packages/create-shipwright/src/index.ts`, a new `docs/REMOVING-FEATURES.md`,
and a README pointer. **No `apps/web` / package source changes** → the app gate +
e2e are unaffected; the only verification surface is the CLI itself.

## Design

### CORE vs OPTIONAL

- CORE (always kept, never offered): `ui`, `auth`, `db`, `env`, `config`.
- OPTIONAL (selectable, 11): `analytics`, `observability`, `payments`, `email`,
  `security`, `seo`, `legal`, `pwa`, `storage`, `i18n`, `api`.

### CLI (`index.ts`)

- `OPTIONAL_FEATURES` manifest: `{ key, title, hint }[]` (+ `FEATURE_KEYS`).
- `--features <comma-list | all>` = the optional features to **keep**; the rest
  are "dropped" (their removal guide is surfaced). Validate each against
  `FEATURE_KEYS`; error on unknown listing valid keys.
- Resolution:
  - `--features all` OR (no flag AND non-TTY) → keep all (zero regression).
  - `--features a,b` → keep {a,b}.
  - no flag AND TTY → `prompts` **multiselect** (all pre-selected; unselect to
    drop). Abort-safe.
- `dropped = FEATURE_KEYS \ kept`.
- Plan output gains a `features` line (kept count or list + dropped list).
- After scaffold (and in dry-run plan): if `dropped.length`, print a clear block —
  "the scaffold ships with every feature (so it builds as-is); to remove the ones
  you dropped, follow `docs/REMOVING-FEATURES.md`" + the dropped titles.
- `--help` documents `--features` with an example.
- Messaging is explicit that **nothing is auto-removed** — selection only tailors
  the guide.

### Durable guide (`docs/REMOVING-FEATURES.md`)

The authoritative per-feature removal guide (also helps `git clone` users, not
just CLI users). One section per optional feature with **symbol/region/file**
references (drift-resistant, not brittle line numbers): package dir, workspace
dep(s), `next.config.ts` transpile entry, `proxy.ts`, `layout.tsx`,
`packages/env` block + `.env.example`, `packages/db/schema.ts` table(s), dashboard
card(s)/route(s). Flag the **involved / core-coupled** ones honestly:
`observability` (logger is pervasive), `seo` (createMetadata is pervasive),
`email` (imported by core `@repo/auth`), `i18n` (restructures the `[locale]`
segment — eased by #4's `applyI18n` seam).

### turbo.json / pnpm-workspace

No edits: `pnpm-workspace.yaml` uses a `packages/*` glob and `turbo.json` has no
per-package tasks, so a removed package simply leaves the graph. (`allowBuilds`
entries for `@swc/core`/`@parcel/watcher` become harmless no-ops if i18n goes.)
The doc notes the optional `globalEnv` prune in turbo.json (cosmetic).

## Tasks

1. **Manifest + flag**: add `OPTIONAL_FEATURES`/`FEATURE_KEYS`, `Options.features`,
   `--features` parsing + validation, `--help` text.
2. **Selection**: resolve `kept`/`dropped` (flag / multiselect / non-TTY default).
3. **Output**: `features` plan line + dropped-features removal pointer block.
4. **Doc**: write `docs/REMOVING-FEATURES.md` (11 sections) + README pointer.
5. **Verify**: `pnpm --filter create-shipwright build` + `check-types` + `lint`;
   `node dist/index.js --dry-run --features payments,email my-test` (shows kept +
   dropped); `--dry-run` no-flag non-TTY (keeps all); `--features bogus` errors.
   Root `check-types`/`lint`/`build`/`test` unaffected (sanity). Commit → PR →
   CI (verify Node 22/24 + pg-compat) green via `gh run view` → ff-merge.

## Verification notes

- The CLI has no unit tests today; verification is build + type-check + lint +
  `--dry-run` behavior assertions (the same bar the CLI already meets).
- e2e/app build can't regress (no app files touched), but the full gate is run
  once as a sanity check before merge.
