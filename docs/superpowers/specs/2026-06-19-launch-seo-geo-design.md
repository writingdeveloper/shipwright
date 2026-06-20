# Launch hardening — Spec 1: SEO / GEO / meta · UX

- **Date:** 2026-06-19
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Part of:** launch-readiness work (Spec 1 of 3; Spec 2 = GA4, Spec 3 = infra/email)

## Context & goal

The starter has solid SEO basics (metadata, Organization/Website JSON-LD,
sitemap, robots, canonical) but, for a real 2026 launch, is missing GEO (AI
search) signals and several launch-meta/UX essentials. This spec adds them,
following shipwright conventions: pure builders in `@repo/seo` (no env, no
runtime), opt-in + graceful-no-op where a value is involved, and the reference
app demonstrates each via the App Router file conventions.

**Goal:** AI search engines can discover/cite the app (explicit crawler policy +
`llms.txt` + richer JSON-LD), shared links render a real preview card, the app
ships a branded 404 / error boundary / real icons / skip-link, and Search Console
verification is one env var away.

## A. `@repo/seo` extensions

1. **Search Console verification** — add `verification?: { google?: string }` to
   `SeoSiteConfig`; `createMetadata` emits `Metadata.verification` when present.
   `apps/web/lib/site.ts` sets it from a new optional client env
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (no-op when unset).
2. **AI-crawler robots policy** — `buildRobots` gains `aiCrawlers?: "allow" |
   "disallow"` (default `"allow"`). When set, emit explicit `rules[]` entries for
   `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`
   (allow → `allow: ["/"]` minus the app's `disallow`; disallow → `disallow:
   ["/"]`). The existing `*` rule stays. Return type becomes a `rules` array.
3. **`llms.txt` builder** — `buildLlmsTxt({ name, description, url, sections })`
   returns the emerging-standard markdown (`# name`, `> description`, `##`
   sections of `[title](url): note` links). `apps/web/app/llms.txt/route.ts`
   serves it as `text/plain`.
4. **JSON-LD types** — add `articleJsonLd`, `faqJsonLd`, `breadcrumbJsonLd`
   (schema.org `Article` / `FAQPage` / `BreadcrumbList`) alongside the existing
   `organizationJsonLd`/`websiteJsonLd`, rendered via the existing `<JsonLd>`.
5. **OG image helper** — `ogImage(opts)` wrapping `next/og` `ImageResponse` to
   render a branded default card (title + site name on a solid background, no
   external assets). Exported from a new `@repo/seo/og` subpath (server-only,
   pulls `next/og`).

## B. apps/web

6. **`app/opengraph-image.tsx`** — default OG card via `ogImage()` (the
   `metadataBase` image default `/opengraph-image` finally resolves).
7. **`app/not-found.tsx`** — branded 404 (shadcn card + link home), `noindex`.
8. **`app/error.tsx`** — segment error boundary (`'use client'`, `reset()`,
   logs via `@repo/observability/logger`), preserving chrome.
9. **`app/icon.svg` + `app/apple-icon.tsx`** — a real brand mark (SVG favicon +
   180×180 apple-touch via `ImageResponse`), replacing the placeholder reliance.
10. **Skip-to-content** — root layout renders a visually-hidden-until-focus
    `<a href="#main">` and pages’ `<main>` gets `id="main"` (start with the
    dashboard + landing). A small `@repo/ui`-styled link or inline class.

## Env

New optional client var `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in `@repo/env`
(server-less; no-op when unset). Add to `turbo.json` `globalEnv` + `.env.example`.

## Testing

- **vitest (`@repo/seo`)**: `createMetadata` emits verification when set / omits
  when not; `buildRobots` emits AI-crawler rules on `allow`/`disallow` and the
  `*` rule always; `buildLlmsTxt` shape; `articleJsonLd`/`faqJsonLd`/`breadcrumbJsonLd`
  produce valid `@type` objects.
- **e2e**: `/llms.txt` → 200 `text/plain`; `/opengraph-image` → 200 `image/png`;
  `/robots.txt` includes an AI-crawler line; a nonexistent path renders the
  branded 404; skip-link is the first focusable element.

## Acceptance criteria

1. `pnpm build/check-types/lint/test` pass; everything no-ops without env.
2. `GET /llms.txt` (text), `/opengraph-image` (png), `/icon.svg`, `/apple-icon`
   all 200; `/robots.txt` lists the AI crawlers.
3. With `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` set, the home `<head>` carries the
   `google-site-verification` meta.
4. A 404 renders the branded page; a thrown render error hits `error.tsx` (not a
   blank/global crash); skip-link works by keyboard.
5. No CSP change needed (OG/icon are same-origin `ImageResponse`; JSON-LD is a
   data block already allowed).

## Out of scope (this spec)

- GA4 (Spec 2), health endpoint + email deliverability (Spec 3).
- Per-page Article/FAQ content wiring beyond a demonstration (builders ship; the
  app shows one usage).
- `loading.tsx` skeletons, `next/image` reference, font tuning (LOW — later).
