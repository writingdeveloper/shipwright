# Launch hardening Spec 1 (SEO/GEO/meta·UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GEO (AI-crawler robots, llms.txt, richer JSON-LD), Search Console verification, a real OG image + icons, and launch-UX (404, error boundary, skip-link) — all following shipwright conventions (pure `@repo/seo` builders, opt-in env, graceful no-op).

**Architecture:** Extend `@repo/seo` with pure builders (verification field, AI-crawler robots, `buildLlmsTxt`, Article/FAQ/Breadcrumb JSON-LD) + a server-only `next/og` `ogImage` helper on a new `./og` subpath. The reference app wires each via App Router file conventions (`opengraph-image`, `llms.txt` route, `not-found`, `error`, `icon`/`apple-icon`) and a skip-link.

**Tech Stack:** Next.js 16 (App Router, `next/og`), React 19, `@repo/seo`, `@repo/env`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-19-launch-seo-geo-design.md`

**Conventions (verified):** `@repo/seo` is pure (no env, no runtime) — builders return plain objects/`Metadata`; the app passes env-derived values in. JSON-LD builders return `JsonLdObject` rendered by `<JsonLd>`. Robots/sitemap are `MetadataRoute.*` shapes. Package tests: `vitest run`, `environment: node`, no setup needed (pure). Run one package: `pnpm --filter @repo/seo <script>`.

---

### Task 1: Add `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env

**Files:**
- Modify: `packages/env/src/index.ts` (client block + runtimeEnv)
- Modify: `turbo.json` (globalEnv)
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Add to the `client` block** in `packages/env/src/index.ts`, after `NEXT_PUBLIC_VAPID_PUBLIC_KEY`:

```ts
    // Google Search Console site verification token (owned by `@repo/seo` usage).
    // OPTIONAL: when set, `@repo/seo`'s createMetadata emits the
    // `google-site-verification` meta tag; unset ⇒ no tag (no-op).
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
```

- [ ] **Step 2: Add to `runtimeEnv`** (after the VAPID public key line):

```ts
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
```

- [ ] **Step 3: Add to `turbo.json` `globalEnv`** (after `NEXT_PUBLIC_VAPID_PUBLIC_KEY`):

```json
    "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
```

- [ ] **Step 4: Append to `apps/web/.env.example`:**

```sh

# SEO — Google Search Console verification (@repo/seo). Optional: set the token
# from Search Console's "HTML tag" method to emit the verification meta tag.
# NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=your_search_console_token
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @repo/env check-types`
Expected: PASS.
```bash
git add packages/env/src/index.ts turbo.json apps/web/.env.example
git commit -m "feat(seo): add optional NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION env"
```

---

### Task 2: `createMetadata` verification support

**Files:**
- Modify: `packages/seo/src/metadata.ts`
- Test: `packages/seo/test/metadata.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test** `packages/seo/test/metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createMetadata } from "../src/metadata";

const site = { name: "Acme", description: "d", url: "https://acme.com" };

describe("createMetadata verification", () => {
  it("emits google-site-verification when configured", () => {
    const m = createMetadata({ ...site, verification: { google: "tok123" } });
    expect(m.verification?.google).toBe("tok123");
  });
  it("omits verification when not configured", () => {
    const m = createMetadata(site);
    expect(m.verification).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm --filter @repo/seo test`
Expected: FAIL (`verification` not on `SeoSiteConfig` / not emitted).

- [ ] **Step 3: Add `verification` to `SeoSiteConfig`** in `metadata.ts` (after `twitterHandle`):

```ts
  /** Optional search-engine verification tokens (e.g. Google Search Console). */
  readonly verification?: { readonly google?: string };
```

- [ ] **Step 4: Emit it** in `createMetadata`'s returned object — add after the `robots` field:

```ts
    ...(site.verification?.google
      ? { verification: { google: site.verification.google } }
      : {}),
```

- [ ] **Step 5: Run the test; verify it passes**

Run: `pnpm --filter @repo/seo test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/seo/src/metadata.ts packages/seo/test/metadata.test.ts
git commit -m "feat(seo): createMetadata Search Console verification"
```

---

### Task 3: AI-crawler robots policy + `buildLlmsTxt`

**Files:**
- Modify: `packages/seo/src/routes.ts`
- Modify: `packages/seo/src/index.ts` (export `buildLlmsTxt` + new types)
- Test: `packages/seo/test/routes.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test** `packages/seo/test/routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildRobots, buildLlmsTxt } from "../src/routes";

describe("buildRobots aiCrawlers", () => {
  it("emits explicit AI-crawler rules when aiCrawlers=allow", () => {
    const r = buildRobots({
      baseUrl: "https://acme.com",
      disallow: ["/dashboard"],
      aiCrawlers: "allow",
    });
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const agents = rules.flatMap((rule) =>
      Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent],
    );
    expect(agents).toContain("GPTBot");
    expect(agents).toContain("ClaudeBot");
    expect(agents).toContain("PerplexityBot");
    expect(agents).toContain("Google-Extended");
    expect(agents).toContain("*");
  });
  it("disallows AI crawlers when aiCrawlers=disallow", () => {
    const r = buildRobots({ baseUrl: "https://acme.com", aiCrawlers: "disallow" });
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const gpt = rules.find((rule) =>
      (Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]).includes("GPTBot"),
    );
    expect(gpt?.disallow).toEqual(["/"]);
  });
});

describe("buildLlmsTxt", () => {
  it("renders title, description and section links", () => {
    const txt = buildLlmsTxt({
      name: "Acme",
      description: "Acme does things",
      url: "https://acme.com",
      sections: [
        { title: "Docs", links: [{ title: "Intro", url: "https://acme.com/intro", note: "start here" }] },
      ],
    });
    expect(txt).toContain("# Acme");
    expect(txt).toContain("> Acme does things");
    expect(txt).toContain("## Docs");
    expect(txt).toContain("[Intro](https://acme.com/intro): start here");
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm --filter @repo/seo test`
Expected: FAIL (`aiCrawlers` unknown / `buildLlmsTxt` not exported).

- [ ] **Step 3: Extend `buildRobots` + add `buildLlmsTxt`** in `routes.ts`. Replace the `BuildRobotsOptions` type and `buildRobots` function with:

```ts
/** The AI/LLM crawlers we emit an explicit policy for when asked. */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
] as const;

/** Options for {@link buildRobots}. */
export type BuildRobotsOptions = {
  /** Absolute site base URL — used to make the `sitemap` URL absolute. */
  readonly baseUrl: string | URL;
  /** Paths to disallow for all crawlers (e.g. `["/dashboard", "/api"]`). */
  readonly disallow?: readonly string[];
  /** Paths to explicitly allow (defaults to `["/"]`). */
  readonly allow?: readonly string[];
  /** Sitemap path; defaults to `/sitemap.xml`. */
  readonly sitemapPath?: string;
  /**
   * Explicit policy for AI/LLM crawlers (GPTBot, ClaudeBot, PerplexityBot,
   * Google-Extended, …). `"allow"` mirrors the default allow/disallow for them
   * (so they can cite the public site); `"disallow"` blocks them entirely.
   * Omit to leave them under the `*` rule (which already allows them).
   */
  readonly aiCrawlers?: "allow" | "disallow";
};

/**
 * Build a `MetadataRoute.Robots`. Always emits a `*` rule (allow + any
 * disallows) and an absolute `sitemap`. When `aiCrawlers` is set, adds an
 * explicit rule for the known AI crawlers so the site's stance on AI citation
 * is unambiguous.
 */
export function buildRobots(options: BuildRobotsOptions): MetadataRoute.Robots {
  const {
    baseUrl,
    disallow = [],
    allow = ["/"],
    sitemapPath = "/sitemap.xml",
    aiCrawlers,
  } = options;

  const starRule = {
    userAgent: "*",
    allow: [...allow],
    ...(disallow.length > 0 ? { disallow: [...disallow] } : {}),
  };

  const rules: NonNullable<MetadataRoute.Robots["rules"]> = [starRule];

  if (aiCrawlers === "allow") {
    rules.push({
      userAgent: [...AI_CRAWLERS],
      allow: [...allow],
      ...(disallow.length > 0 ? { disallow: [...disallow] } : {}),
    });
  } else if (aiCrawlers === "disallow") {
    rules.push({ userAgent: [...AI_CRAWLERS], disallow: ["/"] });
  }

  return {
    rules,
    sitemap: absoluteUrl(baseUrl, sitemapPath),
  };
}

/** One link in an {@link buildLlmsTxt} section. */
export type LlmsTxtLink = {
  readonly title: string;
  readonly url: string;
  readonly note?: string;
};

/** One section in {@link buildLlmsTxt}. */
export type LlmsTxtSection = {
  readonly title: string;
  readonly links: readonly LlmsTxtLink[];
};

/** Inputs for {@link buildLlmsTxt}. */
export type BuildLlmsTxtOptions = {
  readonly name: string;
  readonly description: string;
  readonly url: string | URL;
  readonly sections?: readonly LlmsTxtSection[];
};

/**
 * Build an `llms.txt` (the emerging standard giving AI systems a curated,
 * LLM-readable index of a site): `# name`, a `> description` blockquote, then
 * `## section` headings with `[title](url): note` bullet links.
 */
export function buildLlmsTxt(options: BuildLlmsTxtOptions): string {
  const { name, description, sections = [] } = options;
  const lines: string[] = [`# ${name}`, "", `> ${description}`, ""];
  for (const section of sections) {
    lines.push(`## ${section.title}`, "");
    for (const link of section.links) {
      lines.push(`- [${link.title}](${link.url})${link.note ? `: ${link.note}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
```

- [ ] **Step 4: Export the new symbols** from `packages/seo/src/index.ts` — replace the `./routes` re-export block with:

```ts
export {
  buildSitemap,
  buildRobots,
  buildLlmsTxt,
  absoluteUrl,
  type SitemapEntry,
  type BuildRobotsOptions,
  type BuildLlmsTxtOptions,
  type LlmsTxtSection,
  type LlmsTxtLink,
} from "./routes";
```

- [ ] **Step 5: Run the test; verify it passes**

Run: `pnpm --filter @repo/seo test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/seo/src/routes.ts packages/seo/src/index.ts packages/seo/test/routes.test.ts
git commit -m "feat(seo): AI-crawler robots policy + buildLlmsTxt"
```

---

### Task 4: Article / FAQ / Breadcrumb JSON-LD

**Files:**
- Modify: `packages/seo/src/json-ld.tsx`
- Modify: `packages/seo/src/index.ts`
- Test: `packages/seo/test/json-ld.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test** `packages/seo/test/json-ld.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { articleJsonLd, faqJsonLd, breadcrumbJsonLd } from "../src/json-ld";

describe("articleJsonLd", () => {
  it("builds an Article node", () => {
    const a = articleJsonLd({ headline: "Hi", url: "https://x/p", datePublished: "2026-01-01" });
    expect(a["@type"]).toBe("Article");
    expect(a.headline).toBe("Hi");
  });
});
describe("faqJsonLd", () => {
  it("builds a FAQPage with Question/Answer", () => {
    const f = faqJsonLd([{ question: "Q?", answer: "A." }]);
    expect(f["@type"]).toBe("FAQPage");
    expect((f.mainEntity as unknown[]).length).toBe(1);
  });
});
describe("breadcrumbJsonLd", () => {
  it("builds a BreadcrumbList with positions", () => {
    const b = breadcrumbJsonLd([
      { name: "Home", url: "https://x/" },
      { name: "Docs", url: "https://x/docs" },
    ]);
    expect(b["@type"]).toBe("BreadcrumbList");
    const items = b.itemListElement as Array<{ position: number }>;
    expect(items[0]?.position).toBe(1);
    expect(items[1]?.position).toBe(2);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm --filter @repo/seo test`
Expected: FAIL (builders not exported).

- [ ] **Step 3: Add the builders** to `json-ld.tsx` (after `websiteJsonLd`, before `JsonLdProps`):

```ts
/** Inputs for {@link articleJsonLd}. */
export type ArticleJsonLdOptions = {
  readonly headline: string;
  readonly url: string;
  readonly datePublished?: string;
  readonly dateModified?: string;
  readonly authorName?: string;
  readonly image?: string;
  readonly description?: string;
};

/** Build an `Article` schema.org node. */
export function articleJsonLd(options: ArticleJsonLdOptions): JsonLdObject {
  const { headline, url, datePublished, dateModified, authorName, image, description } = options;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    url,
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(authorName ? { author: { "@type": "Person", name: authorName } } : {}),
    ...(image ? { image } : {}),
    ...(description ? { description } : {}),
  };
}

/** One question/answer pair for {@link faqJsonLd}. */
export type FaqItem = { readonly question: string; readonly answer: string };

/** Build a `FAQPage` schema.org node from question/answer pairs. */
export function faqJsonLd(items: readonly FaqItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** One crumb for {@link breadcrumbJsonLd}. */
export type Breadcrumb = { readonly name: string; readonly url: string };

/** Build a `BreadcrumbList` schema.org node (1-based positions). */
export function breadcrumbJsonLd(crumbs: readonly Breadcrumb[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}
```

- [ ] **Step 4: Export** from `packages/seo/src/index.ts` — add to the `./json-ld` re-export block:

```ts
export {
  JsonLd,
  organizationJsonLd,
  websiteJsonLd,
  articleJsonLd,
  faqJsonLd,
  breadcrumbJsonLd,
  type JsonLdObject,
  type JsonLdProps,
  type OrganizationJsonLdOptions,
  type WebSiteJsonLdOptions,
  type ArticleJsonLdOptions,
  type FaqItem,
  type Breadcrumb,
} from "./json-ld";
```

- [ ] **Step 5: Run the test; verify it passes**

Run: `pnpm --filter @repo/seo test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/seo/src/json-ld.tsx packages/seo/src/index.ts packages/seo/test/json-ld.test.ts
git commit -m "feat(seo): Article/FAQ/Breadcrumb JSON-LD builders"
```

---

### Task 5: OG image helper (`@repo/seo/og`)

**Files:**
- Create: `packages/seo/src/og.tsx`
- Modify: `packages/seo/package.json` (add `./og` export)

- [ ] **Step 1: Create `packages/seo/src/og.tsx`:**

```tsx
import { ImageResponse } from "next/og";

/**
 * @repo/seo/og — a default OpenGraph card via `next/og`'s `ImageResponse`.
 *
 * Server-only (pulls `next/og`). Renders a branded title + site-name card on a
 * solid background — no external image assets, no fonts to ship — so a consuming
 * app gets a real social-share preview from one call in `app/opengraph-image.tsx`.
 * Standard OG size is 1200×630.
 */
export type OgImageOptions = {
  readonly title: string;
  readonly subtitle?: string;
  readonly background?: string;
  readonly foreground?: string;
};

export const OG_SIZE = { width: 1200, height: 630 } as const;

export function ogImage(options: OgImageOptions): ImageResponse {
  const {
    title,
    subtitle,
    background = "#0a0a0a",
    foreground = "#fafafa",
  } = options;
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background,
          color: foreground,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 34, marginTop: 28, opacity: 0.7 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    ),
    { ...OG_SIZE },
  );
}
```

- [ ] **Step 2: Add the `./og` export** to `packages/seo/package.json` `exports` (after `./routes`):

```json
    "./routes": "./src/routes.ts",
    "./og": "./src/og.tsx"
```

- [ ] **Step 3: Verify types**

Run: `pnpm --filter @repo/seo check-types`
Expected: PASS. (If `next/og`'s JSX needs it, the package already extends the react tsconfig via `@types/react`; `ImageResponse` accepts a React element.)

- [ ] **Step 4: Commit**

```bash
git add packages/seo/src/og.tsx packages/seo/package.json
git commit -m "feat(seo): ogImage helper (next/og) on ./og subpath"
```

---

### Task 6: Wire SEO/GEO into apps/web

**Files:**
- Modify: `apps/web/lib/site.ts` (verification from env)
- Modify: `apps/web/app/robots.ts` (aiCrawlers)
- Create: `apps/web/app/llms.txt/route.ts`
- Create: `apps/web/app/opengraph-image.tsx`
- Modify: `apps/web/package.json` (`@repo/seo` already a dep — confirm)

- [ ] **Step 1: Set verification on `seoSite`** in `apps/web/lib/site.ts`. Add the env-derived field to the `seoSite` object (after `twitterHandle`):

```ts
  twitterHandle: "writingdeveloper",
  ...(env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
```

(`env` is already imported in `site.ts`.)

- [ ] **Step 2: Enable AI crawlers** in `apps/web/app/robots.ts` — add `aiCrawlers: "allow"`:

```ts
  return buildRobots({
    baseUrl: SITE_URL,
    disallow: ["/dashboard", "/api"],
    aiCrawlers: "allow",
  });
```

- [ ] **Step 3: Create `apps/web/app/llms.txt/route.ts`:**

```ts
import { buildLlmsTxt } from "@repo/seo";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/site";

/**
 * `/llms.txt` — the emerging standard giving AI systems a curated, LLM-readable
 * index of the site. Served as text/plain markdown.
 */
export function GET(): Response {
  const body = buildLlmsTxt({
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    sections: [
      {
        title: "Pages",
        links: [
          { title: "Home", url: `${SITE_URL}/`, note: "product overview" },
          { title: "Privacy", url: `${SITE_URL}/privacy` },
          { title: "Terms", url: `${SITE_URL}/terms` },
        ],
      },
    ],
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
```

- [ ] **Step 4: Create `apps/web/app/opengraph-image.tsx`:**

```tsx
import { ogImage, OG_SIZE } from "@repo/seo/og";

import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

/**
 * Default OpenGraph card for the whole site (resolves the `/opengraph-image`
 * default that `createMetadata` points at). Per-route files can override.
 */
export const alt = SITE_DESCRIPTION;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return ogImage({ title: SITE_NAME, subtitle: SITE_DESCRIPTION });
}
```

- [ ] **Step 5: Verify types + lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/site.ts apps/web/app/robots.ts apps/web/app/llms.txt apps/web/app/opengraph-image.tsx
git commit -m "feat(seo): wire verification, AI robots, llms.txt, OG image into web"
```

---

### Task 7: Launch UX — 404, error boundary, icons, skip-link

**Files:**
- Create: `apps/web/app/not-found.tsx`, `apps/web/app/error.tsx`, `apps/web/app/icon.svg`, `apps/web/app/apple-icon.tsx`
- Modify: `apps/web/app/layout.tsx` (skip-link), `apps/web/app/page.tsx` + `apps/web/app/dashboard/page.tsx` (`id="main"`)

- [ ] **Step 1: Create `apps/web/app/not-found.tsx`:**

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@repo/ui/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      id="main"
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-3xl font-semibold tracking-tight">404</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        We couldn&apos;t find that page.
      </p>
      <Button asChild>
        <Link href="/">Back home</Link>
      </Button>
    </main>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/error.tsx`** (segment boundary — unlike `global-error`, it keeps the root layout/chrome):

```tsx
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@repo/observability/logger";
import { Button } from "@repo/ui/components/ui/button";

/**
 * Segment error boundary: catches render errors in a page/segment WITHOUT
 * replacing the root layout (that's `global-error.tsx`). Logs always; forwards
 * to Sentry when configured (no-op otherwise).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("segment render error", { error, digest: error.digest });
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        An unexpected error occurred. You can try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/icon.svg`** (a simple brand mark — replaces placeholder reliance for the favicon):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0a0a0a" />
  <text x="16" y="22" font-family="sans-serif" font-size="20" font-weight="700" fill="#fafafa" text-anchor="middle">S</text>
</svg>
```

- [ ] **Step 4: Create `apps/web/app/apple-icon.tsx`** (180×180 via `ImageResponse`):

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fafafa",
          fontSize: 110,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 5: Add the skip-link** in `apps/web/app/layout.tsx` — render it as the first child of `<body>` (before `<ServiceWorkerProvider />`):

```tsx
      <body className="antialiased">
        <a
          href="#main"
          className="bg-background text-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <ServiceWorkerProvider />
```

- [ ] **Step 6: Add `id="main"`** to the landing and dashboard `<main>` so the skip-link has a target. In `apps/web/app/page.tsx` find the top-level `<main` and add `id="main"`; in `apps/web/app/dashboard/page.tsx` change `<main className="bg-background flex min-h-svh justify-center p-6">` to include `id="main"`:

```tsx
    <main id="main" className="bg-background flex min-h-svh justify-center p-6">
```

(For `page.tsx`, add `id="main"` to its outermost `<main>` element similarly. If the landing page's root is not a `<main>`, wrap its content or add `id="main"` to the primary landmark.)

- [ ] **Step 7: Verify types + lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/not-found.tsx apps/web/app/error.tsx apps/web/app/icon.svg apps/web/app/apple-icon.tsx apps/web/app/layout.tsx apps/web/app/page.tsx apps/web/app/dashboard/page.tsx
git commit -m "feat(seo): launch UX — 404, error boundary, icons, skip-link"
```

---

### Task 8: e2e + full verification + docs

**Files:**
- Create/extend: `apps/web/e2e/seo-geo.spec.ts` (or extend `seo-legal.spec.ts`)
- Modify: `README.md` (note GEO/llms.txt + verification under SEO row), `DEPLOY.md` (verification env)

- [ ] **Step 1: Add e2e** `apps/web/e2e/seo-geo.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("serves llms.txt as text/plain", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(await res.text()).toContain("# Shipwright");
});

test("opengraph-image renders a PNG", async ({ request }) => {
  const res = await request.get("/opengraph-image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("robots lists AI crawlers", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/GPTBot/);
});

test("unknown route renders the branded 404", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("icon + apple-icon are served", async ({ request }) => {
  expect((await request.get("/icon.svg")).status()).toBe(200);
  expect((await request.get("/apple-icon")).status()).toBe(200);
});
```

- [ ] **Step 2: Run e2e**

Run: `pnpm test:e2e`
Expected: PASS (these + existing specs). If the apple-icon path differs (Next may hash it), assert via the rendered `<head>` `apple-touch-icon` link instead, or drop that one assertion.

- [ ] **Step 3: Full gate**

Run: `pnpm check-types && pnpm lint && pnpm test && pnpm build`
Expected: ALL PASS with no env set.

- [ ] **Step 4: Update `README.md`** — in the stack table SEO row, note GEO: change the SEO row's Default to `metadata / sitemap / robots / JSON-LD / llms.txt / OG image` and keep ✅. Add a one-line under the table or roadmap noting AI-crawler policy + Search Console verification are built in.

- [ ] **Step 5: Update `DEPLOY.md`** — add a row to the optional-integrations table:

```markdown
| SEO verification (`@repo/seo`) | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | No verification meta tag emitted (the rest of SEO/GEO works regardless) |
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/seo-geo.spec.ts README.md DEPLOY.md
git commit -m "test(seo): e2e for llms.txt/OG/robots/404/icons + docs"
```

---

## Self-review notes (author check vs. spec)

- **Spec coverage:** A1 verification (Task 2+6), A2 AI robots (Task 3+6), A3 llms.txt (Task 3+6), A4 JSON-LD (Task 4), A5 OG helper (Task 5), B6 opengraph-image (Task 6), B7 not-found (Task 7), B8 error (Task 7), B9 icon/apple-icon (Task 7), B10 skip-link (Task 7), env (Task 1), tests (each task + Task 8 e2e), acceptance (Task 8 gate). All map.
- **Type consistency:** `buildRobots` now returns `{ rules: [...] , sitemap }` (array) — `robots.ts` consumes it unchanged (Next accepts a rules array). `verification?: { google?: string }` is the same shape in `SeoSiteConfig` (Task 2) and `site.ts` (Task 6). `ogImage`/`OG_SIZE` defined in Task 5, used in Task 6. JSON-LD builders return `JsonLdObject` (rendered by existing `<JsonLd>`).
- **No silent caps:** Task 7 Step 6 + Task 8 Step 2 flag the two spots that depend on the app's existing markup (landing `<main>`) / Next's icon path — handle at implementation, don't assume.
- **Delta risk:** changing `buildRobots`'s return from a single `rules` object to an array could break an existing `routes.test.ts` assertion if one exists — Task 3 creates/updates that test to the array shape.
