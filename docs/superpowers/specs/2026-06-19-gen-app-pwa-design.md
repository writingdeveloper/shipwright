# `pnpm gen app` PWA Option — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorm)

## Goal

Make scaffolding an **installable + offline PWA app** a one-command operation,
removing the manual ~7-step assembly that dogfooding surfaced.

## Context — dogfooding findings

Scaffolded a real app (`pnpm gen app --args demo-pwa 3200`) and tried to make it a PWA:

- The `app` generator template is an empty Next app wired only to `@repo/ui`; it
  builds with **zero edits** ✅, but is PWA 0%.
- `@repo/pwa` does **not** ship `sw.js` — the SW is "owned by the app"
  (`apps/web/public/sw.js`, 152 lines), so a new app copies it by hand.
- `sw.js` hardcodes app-specific precache (`/offline`, `/icons/icon-192.png`) →
  the new app must also edit the SW internals.
- offline page, icons (×3), and the CSP `proxy.ts` are all manual; the whole flow
  is undocumented (one must reverse-engineer `apps/web`).
- Minor: `config.ts` headless docs said `-- name` (Turbo needs `--args`) — already fixed.

## Approach

Extend the **existing** `app` generator with a `pwa` option, rather than a
separate generator (DRY — reuse the base app actions).

## Design

### Generator (`turbo/generators/config.ts`)

- Add a `pwa` confirm prompt to the `app` (and `add-app` alias) generator:
  _"Make it a PWA (installable + offline)?"_ (default: no).
- Convert `actions` to a function: `(data) => [...base, ...(data.pwa ? pwaActions : [])]`.
- Shared templates branch on `{{#if pwa}}`; PWA-only files are conditional add actions.
- Headless: `pnpm gen app --args my-app 3200 true`.

### Generated assets (when `pwa=true`)

| File | Source / content |
|---|---|
| `app/manifest.ts` | `defineManifest({ name, icons: [svg] })` from `@repo/pwa/manifest` |
| `public/sw.js` | `.hbs` templated from `apps/web/public/sw.js` (CACHE_VERSION, `OFFLINE_URL="/offline"`, precache = `['/', '/offline', '/icon.svg']`) |
| `app/offline/page.tsx` | static offline fallback page |
| `app/icon.svg` | single-color placeholder; manifest references it; comment notes PNG replacement |
| `proxy.ts` | `@repo/config` nonce CSP (already emits `worker-src`/`manifest-src`) |
| `app/layout.tsx` (`{{#if pwa}}`) | `<ServiceWorkerProvider/>` from `@repo/pwa/register` |
| `package.json` (`{{#if pwa}}`) | `+ @repo/pwa`, `@repo/config` deps |
| `next.config.ts` (`{{#if pwa}}`) | `+ transpilePackages` entries `+ headers()` from `@repo/config/headers` |

### `@repo/pwa` change

- Add an optional `icons` override to `defineManifest` (currently the PNG icon
  array is hardcoded). The PWA template passes a single SVG icon. `apps/web` keeps
  the default — **no behavior change** for the existing app.

### Verification (the generator contract)

- A generated PWA app passes `pnpm install && check-types && lint && build` with
  **zero manual edits**, and serves `/manifest.webmanifest` + `/sw.js`. Re-run the
  dogfooding (`gen app --args … true` → install → gate) to confirm, then clean up.

### Docs

- README "Getting started" + `@repo/pwa/CLAUDE.md`: document the `pnpm gen app`
  PWA option, how to replace the placeholder icon, and how to add push
  (`@repo/pwa/push` + `@repo/db`) and an install button (`@repo/pwa/install`).

## Out of scope (YAGNI)

- **web-push** — pulls `@repo/db`/`env`/VAPID; the app adds `@repo/pwa/push` when needed (documented).
- **install-prompt button** — the app adds `@repo/pwa/install` (documented).
- **PNG icon generation** — placeholder SVG + a doc note; a sharp-based generator is a separate future concern.

## Risks / notes

- **plop is text-only**: PNG icons can't be templated (handlebars is text) → an SVG
  placeholder sidesteps this and keeps the manifest valid.
- **SW duplication**: the templated `sw.js` duplicates logic from
  `apps/web/public/sw.js`. Acceptable — each app owns its SW per the package
  philosophy; a header comment notes the source so they can be kept in sync.
