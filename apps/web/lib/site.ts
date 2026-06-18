import type { SeoSiteConfig } from "@repo/seo";
import { defaultLegalConfig, type LegalConfig } from "@repo/legal";

import { env } from "../env";

/**
 * Single source of truth for the app's public identity, shared by the SEO
 * metadata/sitemap/robots wiring and the legal pages.
 *
 * The canonical origin comes from the optional `NEXT_PUBLIC_APP_URL` (owned by
 * `@repo/env`) and defaults to localhost so a fresh clone works with no config.
 * Set `NEXT_PUBLIC_APP_URL` to the real origin in production so canonical,
 * OpenGraph, sitemap, and robots URLs are absolute and correct.
 */
export const SITE_URL = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const SITE_NAME = "Shipwright";

export const SITE_DESCRIPTION =
  "AI-native Next.js + Turborepo starter for shipping MVPs fast.";

/** SEO site config consumed by `@repo/seo`'s `createMetadata`. */
export const seoSite: SeoSiteConfig = {
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  twitterHandle: "writingdeveloper",
};

/**
 * Legal config consumed by `@repo/legal`'s `<PrivacyPolicy>` / `<TermsOfService>`.
 * Starts from the package defaults (which seed the real US sub-processor, Turso)
 * and overrides the app-specific identity. The owner should set a real contact
 * email and review the documents before launch.
 */
export const legalConfig: LegalConfig = {
  ...defaultLegalConfig,
  appName: SITE_NAME,
  entityName: SITE_NAME,
  websiteUrl: SITE_URL,
  lastUpdated: "2026-06-17",
};

/** Public, indexable routes — the source list for the sitemap. */
export const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/privacy",
  "/terms",
] as const;
