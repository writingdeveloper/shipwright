/**
 * @repo/seo — SEO building blocks for the Next.js App Router.
 *
 * Three concerns, also importable via subpaths:
 * - `@repo/seo/metadata` → `createMetadata(site, page)`: a Next `Metadata`
 *   object with OpenGraph + Twitter + canonical defaults and a title template.
 * - `@repo/seo/json-ld` → `organizationJsonLd()`, `websiteJsonLd()`, and a
 *   `<JsonLd>` component for schema.org structured data.
 * - `@repo/seo/routes` → `buildSitemap()` / `buildRobots()` for `sitemap.ts` /
 *   `robots.ts`, plus an `absoluteUrl()` helper.
 *
 * Everything is pure data/JSX — the package carries no runtime state — so the
 * builders unit-test cleanly and the real end-to-end proof (`/sitemap.xml`,
 * `/robots.txt`, `<head>` tags) lives in the consuming app's e2e suite.
 */

export {
  createMetadata,
  type SeoSiteConfig,
  type CreateMetadataOptions,
} from "./metadata";

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
