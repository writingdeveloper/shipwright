# Starter hardening — Design & Program Spec

**Status:** approved 2026-07-11 · **Source:** 6-agent audit of "what breaks when you
start a _new_ product from this starter" (onboarding · de-Tasks cost · architecture
lock-in · dependency risk · UI maturity · deploy/CI/doc drift).

## Goal

Make the **second MVP** — the reason this starter exists — provably work. Today the
`git clone` path works (verified: install → one secret → `db:push` → dev → sign-up →
CRUD, ~2 minutes on Windows). The paths this repo actually advertises do not.

## The finding that shapes everything

The ~25 audit findings collapse into **three root causes**, and every one of them is
a _missing gate_, not a missing fix:

1. **The reverse direction is never exercised.** The repo is dogfooded
   `apps/web → packages/*` (extraction). Nobody has ever run it backwards —
   scaffold → remove features → rename → eject the domain → deploy. So
   `docs/REMOVING-FEATURES.md` tells you to delete tables that core
   `packages/db/src/owner-scope.ts:3` hard-imports (breaking a package the same doc
   calls un-removable); `Dockerfile:29-48` copies 16 workspace manifests while the
   lockfile has 21 (rotted for 3 weeks, because **CI never builds the image**); and
   `turbo/generators/templates/app/app/layout.tsx.hbs:10` still lacks the
   `await connection()` that both real apps already have.

2. **Fail-open defaults.** `packages/eslint-config/base.js:43-50` hardcodes the
   owner-table names, so renaming `task` → `invoice` silently disables the
   cross-user-leak guardrail while CI stays green. `packages/env/src/index.ts:45`
   defaults `DATABASE_URL` to `file:local.db`, so a production deploy that forgets it
   boots "successfully" onto ephemeral container storage.
   `packages/security/src/config.ts:33` defines `isDistributedRateLimitEnabled()` —
   the exact detector for the serverless rate-limit hole — and **never calls it**.

3. **Doc drift has no gate.** `DEPLOY.md`, `SECURITY.md:38-41`, `README.md:29`,
   `engines.node`, and `REMOVING-FEATURES.md` each contradict the code. Nothing fails
   when they do.

**Therefore the governing principle of this program:**

> **Fix + Gate.** No fix lands without an automated check that fails if it regresses.
> A fix without a gate rots again in three weeks — that is the observed history of
> this repo, not a hypothetical.

The individual bug fixes below are cheap (PR 1 is ~1 hour of edits). The gates are the
deliverable.

## Strategic decisions (approved 2026-07-11)

| Decision                  | Choice                      | Why                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **nonce CSP lock-in**     | **Hybrid split**            | Keep strict nonce CSP for the app surface (dashboard/settings/admin). Move marketing + legal pages into a `(marketing)` route group with its own root layout (no `connection()`) → static, CDN-cacheable, served a static CSP. Also add the missing extension seam to `CspOptions`. Rejected `experimental.sri` (betting a starter on an experimental flag) and status-quo (marketing pages permanently uncacheable).                    |
| **org/team multitenancy** | **Pre-emptive `orgId`**     | Add `organization`/`member` and a nullable `orgId` on owner tables now; auto-create a personal org on sign-up. No invite UI (YAGNI). Rationale: the schema axis is the irreversible part, and it is cheapest before there are users. Rejected full org/team (no consumer yet — violates the extract-don't-pre-create discipline) and do-nothing (turns "invite a teammate" into a schema + owner-scope + lint + test + billing rewrite). |
| **`@repo/ui` growth**     | **Usage-driven extraction** | Replace the raw `<table>`/`<select>`/`<button>`/copy-pasted pagination/hand-rolled confirm already sitting in `apps/admin` with real components, extracting each into `@repo/ui` as it gains a consumer. Honours CLAUDE.md's "extract from real usage, don't pre-create". Rejected bulk-adding 16 shadcn components (would create consumer-less abstractions).                                                                           |

## Out of scope

- `create-shipwright` **npm publish** — needs `NPM_TOKEN` in repo secrets (owner action).
  The 404 on `npx create-shipwright` is real but not fixable from code.
- ESLint 9 → 10 (blocked upstream on `eslint-plugin-react`, 18 months without a
  release). Track only; add a Dependabot ignore so it stops opening unmergeable PRs.
- Postgres runtime swap (Better Auth has never run on pg; `packages/auth/src/server.ts:33`
  hardcodes `provider: "sqlite"`). We **correct the README claim** rather than build it.
- Full team/invite UI, billing per-org, Base UI migration.

## Program: seven PRs

Each PR is independently reviewable, ends green on the full gate
(`lint · check-types · build · test · test:e2e`), and ff-merges to `main`.

### PR 1 — Stop the bleeding + drift gates

**Fixes** (~1 hour of edits):

| Fix                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engines.node` → `">=22.13"` (root + `create-shipwright`)        | `package.json:37-40` claims `>=20` but `packageManager: pnpm@11.3.0` requires Node ≥22.13. `.github/workflows/ci.yml:17-23` already excludes Node 20 _and its comment states the reason_. The lie ships in the published CLI (`packages/create-shipwright/package.json:31-33`) and is echoed in `Dockerfile:15` ("the repo's Node engine (>=20; we use 22)").                                                                                                 |
| `await connection()` in the app generator's root layout          | `turbo/generators/templates/app/app/layout.tsx.hbs:10` is a sync `RootLayout`, yet `templates/app/proxy.ts.hbs:14-19` mints a nonce CSP. Measured on a generated app: page prerenders `○ (Static)`, its 13 scripts carry **no nonce**, `strict-dynamic` therefore blocks all 13, **hydration never happens**. Dev looks fine; only prod is dead. Both real apps already have the fix (`apps/web/app/[locale]/layout.tsx:88`, `apps/admin/app/layout.tsx:29`). |
| `Dockerfile` COPY the 5 missing workspace manifests              | `Dockerfile:29-48` copies 16; the lockfile has 21 (`apps/admin`, `packages/{api,i18n,pwa,storage}`). `pnpm install --frozen-lockfile` cannot resolve `apps/web`'s `workspace:*` deps on api/i18n/pwa/storage → deps stage fails.                                                                                                                                                                                                                              |
| Call `isDistributedRateLimitEnabled()` and warn in production    | `packages/security/src/config.ts:33` — defined, exported, **never called**. In-memory limiter (`ratelimit.ts:68-130`) is per-instance, so the effective limit is `10 × N_instances` and N _grows with the attack_.                                                                                                                                                                                                                                            |
| `@repo/ui` `exports` gains `"./hooks/*"`                         | `components.json:19` declares a `hooks` alias that `package.json:6-10` does not export → `shadcn add sidebar` (which pulls `use-mobile`) dies on `ERR_PACKAGE_PATH_NOT_EXPORTED`.                                                                                                                                                                                                                                                                             |
| `packages/ui/CLAUDE.md`: `shadcn add … -b radix`                 | shadcn made **Base UI the default in July 2026**. The command this repo's own docs prescribe would now mix Base UI components into a Radix design system, and `components.json` has no field to pin the primitive.                                                                                                                                                                                                                                            |
| Dev-only CSP noise; generator success message; README port clash | `packages/config/src/csp.ts:96` adds `'unsafe-inline'` to dev `style-src`, which the browser **ignores** because a nonce is also present (the code comment at :62 already calls this "contradictory") → 56 violations per dev page load. Generator prints raw Handlebars (`Run pnpm dev --filter={{ dashCase name }}`). `README.md:120` suggests port 3200, which `apps/admin` already uses.                                                                  |

**Gates** ★ — the actual deliverable:

- **`gen app` smoke job**: generate an app → production build → assert the built page
  carries a nonce, reports **zero CSP violations**, and hydrates. This is the check
  that would have caught the template drift, and it permanently prevents a repeat.
- **`docker build` smoke job**: build the image in CI. The Dockerfile rotted precisely
  because `.github/` contains zero occurrences of `docker`.

### PR 2 — Production data safety net

**Fixes:**

- `DATABASE_URL`: reject a `file:` URL when `NODE_ENV === "production"` (zod
  `superRefine`). Today `packages/env/src/index.ts:45` defaults it to `file:local.db`,
  so a deploy that omits it **boots green** and writes to ephemeral container storage —
  while `DEPLOY.md:21-22` explicitly promises "a missing required var fails the build
  fast". Data loss on redeploy, and the doc guarantees it cannot happen.
  **Constraint:** keep the local-dev default intact (a fresh clone must still run with
  zero config), and note that `SKIP_ENV_VALIDATION` bypasses zod defaults entirely —
  under it `DATABASE_URL` becomes `undefined` (`packages/env/CLAUDE.md`). The refinement
  must therefore key off `NODE_ENV`, not off presence, and CI's keyless build path
  (which passes schema-valid placeholders, per `ci.yml`) must stay green.
- **Add `db:migrate` + commit a baseline `packages/db/drizzle/` migration.** There is
  no migration path at all: `git ls-files "*.sql"` returns **0**, and
  `packages/db/package.json:16-19` has no `db:migrate`. `DEPLOY.md:97-99, 182, 261`
  tells operators to run `db:push` **against production** — `drizzle-kit push`
  non-interactively drops/recreates columns. The first deploy survives; the first
  _schema change_ destroys data.
- Replace every production `db:push` instruction in `DEPLOY.md` with `db:migrate`.
- Add an Ops section: backup, rollback, readiness (`backup`/`rollback`/`restore`/
  `readiness` each appear **0 times** across all docs today; `apps/web/app/api/health/route.ts:1-12`
  is liveness-only by design).

**Gates** ★:

- **Migration-drift job**: run `db:generate`; fail if it produces a diff. Forces a
  migration file to accompany every schema change.
- **Env-doc sync job**: cross-check `@repo/env`'s declarations against
  `apps/web/.env.example` and the `DEPLOY.md` tables. (`DEPLOY.md` is currently missing
  **12** shipped variables: `ADMIN_EMAILS`, `NEXT_PUBLIC_GA_ID`, 4 OAuth, 5 S3,
  `NEXT_PUBLIC_APP_NAME`.)

### PR 3 — Starter identity: verify the reverse direction ★ most important

**Fixes:**

- **Flip owner-scoping from fail-open to fail-closed.** Today
  `packages/eslint-config/base.js:43-50` only inspects five hardcoded identifiers, so a
  new domain table is simply _not checked_. Invert it: any table with an owner column
  that is **not** registered in `OWNER_TABLES` fails CI. Registration becomes mandatory
  instead of opt-in. This is the single highest-severity finding in the audit — the
  starter's flagship security feature evaporates on the first thing a new user does
  (rename `task` → their domain), and CI stays green.
- **`pnpm eject-domain <Name>`** — held to the same bar as the existing `pnpm rename`
  (allowlist · idempotent · dry-run · unit-tested). It updates the **four places that
  must stay in lockstep** — `OWNER_TABLES` (`packages/db/src/owner-scope.ts:27-32`),
  the ESLint `tables` option, the `schema.pg.ts` mirror, and both invariant test
  `CASES` arrays — in one command. Measured cost of doing this by hand today: 26 files,
  6–8 hours.
- **Rewrite `docs/REMOVING-FEATURES.md` against the actual code.** It currently
  (a) breaks core `@repo/db` (tells you to delete tables that `owner-scope.ts:3`
  imports), (b) never mentions `apps/admin` — which imports `@repo/payments`
  (`apps/admin/lib/billing-actions.ts:11`) and `@repo/security` (`apps/admin/proxy.ts:9`),
  (c) never mentions `apps/web/lib/action-limits.ts:1`, whose removal dangles **5**
  Server Action files, and (d) names symbols that no longer exist (`isPro`,
  `isBillingConfigured`) while omitting files that do (`manage-billing-button.tsx`,
  `settings/account-actions.ts:9-10`).
- **Extend the `pnpm rename` allowlist.** `scripts/rename.mjs:115-177` covers 8 files
  and catches `SITE_NAME` but not the line beside it: `apps/web/lib/site.ts:19-20`
  (`SITE_DESCRIPTION` → your `<meta description>` and PWA manifest still say
  "Turborepo starter") and `:27` (`twitterHandle: "writingdeveloper"` → the starter
  author's handle lands in **your** Twitter card). Also
  `packages/legal/src/privacy-policy.tsx:77` ("your tasks" in the privacy policy),
  `apps/web/messages/{en,ko}.json:3-4` (landing copy describing the starter), and
  `dashboard/push-actions.ts:60` (`tag: "shipwright-test"`).

**Gates** ★★:

- **REMOVING-FEATURES CI matrix**: for each of the 6 optional features, remove it per
  the doc, then `build` + `check-types`. The doc becomes executable; it can no longer
  drift into breaking the build.
- **`eject-domain` smoke**: eject to a new domain name, then `build` + `test` +
  owner-scope invariants must pass.
- **`rename` residue gate**: after `pnpm rename`, grep for surviving
  `shipwright`/`Shipwright`/`writingdeveloper` outside the documented denylist
  (Stripe `appInfo`, legal template notice — those are intentional, per
  `docs/RENAMING.md:44-45`).

### PR 4 — CSP hybrid split + extension seam

**Fixes:**

- New `apps/web/app/(marketing)/` route group with **its own root layout** and no
  `connection()` → landing, `/privacy`, `/terms` become `○ Static` and CDN-cacheable.
  Exclude the group from the `proxy.ts` matcher (`apps/web/proxy.ts:167-191`) and serve
  it a **static CSP** via `next.config.ts` `headers()`.
- `@repo/config`: add `buildStaticCsp()` and extend `CspOptions`
  (`packages/config/src/csp.ts:19-35`) with `scriptSrc` / `imgSrc` / `frameSrc` /
  `fontSrc`, mirroring the `connectSrc` pattern that already works. Today these are
  hardcoded (`csp.ts:101-119` has **no `frame-src` at all**; `:106` pins
  `img-src 'self' blob: data:`), so Stripe Elements, reCAPTCHA/Turnstile, Intercom,
  YouTube/Calendly embeds, and any external image require forking the shared package.
- Delete the dead `generateStaticParams()` at `apps/web/app/[locale]/layout.tsx:66`
  (neutralised by `connection()` at :88) or make it meaningful.

**Why not just document the tradeoff:** with the current single root layout, _every_
page is dynamic — `apps/web/app/[locale]/[...rest]/page.tsx:9-13` already documents the
trap (a page rendered outside `[locale]` gets no nonce, so the CSP kills all its
scripts). That leaves only "dynamic + strict CSP" or "static + no CSP". The route-group
split is what creates the third option.

**Gate:** assert the marketing routes build as `○ Static`; e2e asserts **zero CSP
violations** on both surfaces (nonce CSP on the app, static CSP on marketing), extending
`apps/web/e2e/security-headers.spec.ts`.

### PR 5 — Pre-emptive `orgId`

**Fixes:** `organization` + `member` tables; nullable `orgId` on owner tables; move
`subscription`'s unique constraint from `userId` → `orgId` (today
`packages/db/src/schema.ts:235-238` declares `userId … .notNull().unique()` — **one
subscription per user**, so org-level billing is schema-impossible); add
`scopedTo({ userId, orgId })` alongside the existing `ownedBy`; auto-create a personal
org on sign-up (so 1 user = 1 org and **no UI changes**). Mirror into `schema.pg.ts`;
extend the owner-scope invariant tests with the org axis. No invite flow.

**Gate:** the fail-closed rule from PR 3 now also requires org-scope registration;
PR 2's migration-drift gate forces the migration file to be committed.

### PR 6 — UI: usage-driven extraction

**Fixes** — replace what already exists as raw HTML, extracting into `@repo/ui` as each
gains a consumer:

| Existing raw usage                                                                                                                                                                                          | Becomes                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/admin/app/users/page.tsx:61`, `audit/page.tsx:97` — raw `<table>` with **no `overflow-x-auto`** (0 occurrences repo-wide)                                                                             | `@repo/ui/table`                                                                                                                     |
| `users/page.tsx:129-149` ≈ `audit/page.tsx:124-138` — duplicated pagination                                                                                                                                 | `@repo/ui/pagination`                                                                                                                |
| `audit/page.tsx:76-81` — raw `<button>` hand-styled with `bg-primary …` (the starter violating its own rule)                                                                                                | `@repo/ui/button`                                                                                                                    |
| `audit/page.tsx:63`, `web/components/locale-switcher.tsx:32` — raw `<select>`                                                                                                                               | `@repo/ui/select`                                                                                                                    |
| `admin/users/delete-user-button.tsx:43-58` — hand-rolled 2-click confirm                                                                                                                                    | `@repo/ui/alert-dialog`                                                                                                              |
| 9 forms split across **two contradictory idioms** (5× client `onSubmit`+`useState`, 4× `useActionState`), with `role="alert"` copy-pasted 11× and `aria-describedby` wired by hand                          | `@repo/ui/form` (RHF + zodResolver), one idiom                                                                                       |
| `globals.css:93-125` — 33 `.dark` tokens that **nothing activates** (`next-themes` absent; nothing adds `.dark` to `<html>`; `layout.tsx:115`'s orphan `suppressHydrationWarning` is the abandoned attempt) | `next-themes` + **nonce wiring** (its FOUC-prevention inline script is blocked by the strict CSP — depends on PR 4) + a theme toggle |
| no toast anywhere                                                                                                                                                                                           | `sonner` (also needs nonce wiring)                                                                                                   |

**Gate:** add axe to `apps/admin` e2e — today `@axe-core/playwright` exists only in
`apps/web/package.json:41`, so the app **full of raw HTML is the one with no a11y
coverage**. Plus a dark-mode e2e (toggle → `.dark` on `<html>` → zero CSP violations).

### PR 7 — Docs & CI hygiene

- `apps/admin/.env.example` (its `.gitignore` already reserves the slot with
  `!.env.example`); `output: "standalone"` in `apps/admin/next.config.ts:8-31`; a
  Dockerfile target; a DEPLOY.md section. Today `vercel.json:3` pins
  `--filter=web`, so **admin can never be deployed** — while `DEPLOY.md` mentions it
  zero times and its only enabling variable (`ADMIN_EMAILS`) is documented only in
  _web's_ `.env.example`, next to a security warning an admin deployer would never read.
- Correct the admin session-sharing comment (`apps/admin/app/api/auth/[...all]/route.ts:1-4`
  advises one canonical `BETTER_AUTH_URL`, but `trustedOrigins`/`crossSubDomainCookies`
  are configured **nowhere**, and the only tested topology —
  `apps/admin/playwright.config.ts:44` — is the opposite: admin on its own origin).
- README prerequisites (Node/pnpm/corepack appear **0 times**; they live only in
  `CONTRIBUTING.md:11-18`, a contributor doc).
- Restate `README.md:29`'s "Postgres = CI-tested swap path" honestly: the **mirror
  schema** is CI-tested (`pg-compat.yml` is real); the app and Better Auth have never
  run on Postgres, and `@repo/db` does not even export `./client.pg`.
- Fix `SECURITY.md:38-41` (points at a `package.json` `overrides` block that does not
  exist and that pnpm 10+ would ignore anyway — `pnpm-workspace.yaml:5-7` says so).
- Add a "Staying up to date" section: `create-shipwright` uses giget (no git history),
  and `SECURITY.md:14` declares forks unsupported — so today there is **no path** to
  receive upstream security fixes.
- `create-shipwright`: fix the printed next-steps (`src/index.ts:536-544` omits
  `db:push` → sign-up 500s with `no such table: user`, and omits `--filter=web` → root
  `pnpm dev` dies on admin's missing `.env` and takes the healthy web app down with it);
  exclude the scaffolder from the scaffold it produces.
- **CI cost**: a PR currently runs a Next production build **6×** (`ci.yml:59` build ×
  2-node matrix, plus `playwright.config.ts` webServers rebuilding for web and admin)
  with **no turbo cache** (`TURBO_TOKEN`/`actions/cache`: 0 occurrences). Reuse the
  turbo artifact for e2e, run e2e on one Node version, add caching.
- Dependabot: ignore the ESLint major so it stops opening unmergeable PRs.

## Verification protocol (every PR)

```
branch → implement → pnpm lint && pnpm check-types && pnpm build && pnpm test && pnpm test:e2e
       → all green → PR → CI green (verify via `gh run view`, read the log — do not
         trust an exit-0 summary) → ff-merge to main
```

**New gates must be proven to fail.** Before a gate is accepted, deliberately introduce
the regression it targets and confirm CI goes red. A gate that has only ever been green
is not a verified gate — and that assumption is exactly how the Dockerfile rotted for
three weeks.

## Risks

- **PR 4 (CSP split)** touches the security surface. Mitigation: the e2e already asserts
  zero CSP violations and per-request nonce uniqueness
  (`apps/web/e2e/security-headers.spec.ts:67-94`); extend rather than replace it, and
  add an explicit assertion that the marketing CSP contains no `'unsafe-inline'`.
- **PR 5 (orgId)** changes the schema. Mitigation: nullable column + personal-org
  backfill; no user-visible change; owner-scope invariants extended in the same PR.
- **PR 3 (fail-closed lint rule)** may flag pre-existing code. That is the point —
  triage each hit rather than weakening the rule.
- **Cumulative scope.** PRs 1–3 remove ~80% of the risk. If the program stalls, it
  should stall after PR 3, not before it.
