# i18n opt-out + app-level locale config — Design

**Status:** approved 2026-06-23
**Improvement:** #4 of the boilerplate-review roadmap (precedes #7 CLI feature-selection)

## Goal

Move locale **policy** (which locales exist) out of the shared `@repo/i18n`
package and into the consuming app, and concentrate the i18n request-pipeline
wiring into small app-local seams — so that:

1. each app generated from the starter declares its own locales without editing
   a shared package, and
2. fully removing i18n becomes a localized, documented change (and #7's
   automated remover becomes tractable, instead of the cross-pipeline surgery
   the plan flagged as the highest-risk removal).

**Hard invariant: zero behavior change.** Same locales (`en` default unprefixed,
`ko` prefixed, `as-needed`), same URLs, same `NEXT_LOCALE` cookie behavior, same
hreflang, the e2e suite passes unchanged.

## Background — current state

`@repo/i18n` owns both the mechanism AND the policy:

- `src/routing.ts` — `defineRouting({ locales: ["en","ko"], defaultLocale: "en", localePrefix: "as-needed" })` (a **singleton**, locales **hardcoded**).
- `src/navigation.ts` — `createNavigation(routing)` → `{ Link, redirect, usePathname, useRouter, getPathname }` (a **singleton** bound to that routing).
- `src/index.ts` — re-exports the `routing` singleton + `locales` / `defaultLocale` / `Locale`.

The app owns the strings (`apps/web/messages/<locale>.json`) and `i18n/request.ts`,
and wires next-intl via `createNextIntlPlugin` (next.config.ts), `createMiddleware(routing)`
(proxy.ts — the request-pipeline backbone), and `NextIntlClientProvider` + `generateStaticParams`
+ `generateMetadata` (layout.tsx).

~17 app files import `@repo/i18n` (config) or `@repo/i18n/navigation` (Link/redirect/…).
The drift-guard test (`packages/i18n/test/messages.test.ts`) reaches into
`apps/web/messages/` and **hardcodes** `["en","ko"]`.

**The problem:** locales are shared-package policy, not app policy; and a missed
`@repo/i18n/navigation` import silently drops the locale prefix (plan's stated
top risk — no compile error today because the bound singleton still resolves).

## Design

### Decision 1 — `@repo/i18n` becomes a pure MECHANISM library (factories, no singletons)

Removing the singletons is the load-bearing decision: it turns every consumer
into a compile-time-checked migration. After this, `@repo/i18n` exports only
factories + types; it has **no knowledge of any app's locale set**.

- `src/routing.ts`: `export function createRouting(config)` — a thin wrapper over
  next-intl's `defineRouting` that applies the starter default `localePrefix: "as-needed"`
  (app-overridable). No `routing` singleton. No hardcoded locales.
- `src/navigation.ts`: `export function createI18nNavigation(routing)` — wraps
  next-intl's `createNavigation`. Returns `{ Link, redirect, usePathname, useRouter, getPathname }`.
  Kept on the `@repo/i18n/navigation` subpath (preserves the client/server split).
- `src/index.ts`: export `createRouting` + the `Routing` type helper. **Remove**
  the `routing` / `locales` / `defaultLocale` singleton exports.

### Decision 2 — the app owns the INSTANCES + policy (new files under `apps/web/i18n/`)

- `routing.ts` (NEW): `export const routing = createRouting({ locales: ["en","ko"], defaultLocale: "en" })`
  + `export type Locale = (typeof routing.locales)[number]` + convenience
  `export const { locales, defaultLocale } = routing`. **This is now the single
  source of truth for this app's locales.**
- `navigation.ts` (NEW): `export const { Link, redirect, usePathname, useRouter, getPathname } = createI18nNavigation(routing)`.
- `proxy.ts` (NEW) — the **removal seam**: `export function applyI18n(request): NextResponse`,
  ON = `createMiddleware(routing)(request)`; to turn i18n OFF, its body becomes
  `return NextResponse.next()` and the next-intl import is dropped. (No "use client"
  on routing.ts/navigation.ts — matches the package's current navigation.ts, which
  server files import too.)
- `request.ts` (existing): change `import { routing } from "@repo/i18n"` → `"./routing"`.

### Decision 3 — proxy.ts loses the backbone coupling

`apps/web/proxy.ts` currently does `import { routing }` + `import createMiddleware`
+ `const intlMiddleware = createMiddleware(routing)`. It becomes
`import { applyI18n } from "./i18n/proxy"` + `const intlResponse = applyI18n(request)`.
The existing `withCsp` nonce/rewrite/redirect branching is **unchanged** — a plain
`NextResponse.next()` (i18n OFF) flows through the "otherwise" branch correctly.
i18n's only footprint in proxy.ts becomes one import + one call.

### Decision 4 — import-site rewrite is a tsc-enforced migration

All app imports move from the package to the app-local modules (relative paths;
apps/web has no `@/*` alias). Because the singletons are **gone** from `@repo/i18n`,
any missed site fails to compile (`no exported member 'Link' / 'routing' / 'defaultLocale'`)
— converting the plan's "silent locale drop" risk into a hard type error.

Depth rule (target = `apps/web/i18n/{routing,navigation}`):

| Location | new import prefix |
|---|---|
| `apps/web/` (proxy.ts) | `./i18n/…` |
| `apps/web/<dir>/` (lib, components, app, i18n) | `../i18n/…` |
| `apps/web/app/[locale]/` (layout, page, not-found) | `../../i18n/…` |
| `apps/web/app/[locale]/<sub>/` (sign-in, sign-up, dashboard, terms, privacy, forgot-password, reset-password) | `../../../i18n/…` |

`routing` / `Locale` / `defaultLocale` → `…/i18n/routing`; `Link` / `redirect` /
`usePathname` / `useRouter` / `getPathname` → `…/i18n/navigation`.

### Decision 5 — drift-guard: glob + move to the app, strengthened

The drift-guard guards app messages against app locales, so after the inversion
it belongs in the app. Move `packages/i18n/test/messages.test.ts` →
`apps/web/tests/messages.test.ts` and strengthen it to:

1. glob `apps/web/messages/*.json` to discover the locale set (no hardcoded list),
2. cross-check against `apps/web/i18n/routing.ts` `routing.locales`: every routing
   locale has a `messages/<l>.json` and vice-versa,
3. assert all locales' key sets are identical (no translation drift).

Adding a locale = add a JSON file + one line in `routing.ts`; the guard auto-covers
it. `@repo/i18n` no longer reaches into the app. `packages/i18n/test/routing.test.ts`
is converted to test the `createRouting` factory (applies `as-needed`; passes
locales through).

### Out of scope (intentionally)

next.config's `withNextIntl` (2 lines) and layout's `NextIntlClientProvider` /
`generateStaticParams` are already localized; #4 leaves them as-is. Their removal
is a straightforward strip that #7's patcher handles. #4 targets only the worst
coupling (the proxy backbone) per the plan's risk note. No actual removal CLI
(that is #7).

## Testing strategy

- `@repo/i18n`: `routing.test.ts` → factory unit test.
- `apps/web`: new `tests/messages.test.ts` (glob + cross-check + drift).
- **e2e is the real proof** of behavior preservation: `e2e/i18n.spec.ts` must pass
  unchanged (locale prefix preserved across navigation/redirect). Run the full
  chromium suite.

## Verification

1. Local gate: `pnpm check-types` (the migration's safety net — a missed import is
   an error here) / `lint` / `build` / `test`.
2. `grep "@repo/i18n" apps/web` afterwards returns ONLY `package.json` +
   `next.config.ts` (transpilePackages) — no source import.
3. e2e chromium green locally.
4. CI: verify (Node 22/24 + e2e + audit) + pg-compat (unaffected). Read
   conclusions via `gh run view --json` (not the watch exit code).

## Risks

- **Missed import → silent locale drop.** Mitigated by Decision 1: it becomes a
  compile error, not a silent bug. Plus the post-rewrite grep and e2e.
- **Wrong relative path.** A bad relative path is a compile error (unlike a wrong
  package import). tsc catches it.
- **`createNavigation` TS2742 in the app.** The instance now lives in the app
  (tsc `noEmit`), so no `.d.ts` is emitted for it — the package's `declaration:false`
  workaround is no longer load-bearing for the instance. Verified by check-types.
