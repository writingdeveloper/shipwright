import type { MetadataRoute } from "next";
import { buildSitemap } from "@repo/seo";

import { PUBLIC_ROUTES, SITE_URL } from "../lib/site";

/**
 * `/sitemap.xml` — generated from the app's public route list via `@repo/seo`.
 * The home page gets the highest priority; the rest are listed so crawlers can
 * discover them. Protected (`/dashboard`) and API routes are intentionally
 * omitted (and disallowed in `robots.ts`).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(
    SITE_URL,
    PUBLIC_ROUTES.map((path) => ({
      path,
      changeFrequency: "monthly",
      priority: path === "/" ? 1 : 0.7,
    })),
  );
}
