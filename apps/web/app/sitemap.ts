import type { MetadataRoute } from "next";
import { routing } from "../i18n/routing";
import { absoluteUrl, buildSitemap } from "@repo/seo";

import { PUBLIC_ROUTES, SITE_URL } from "../lib/site";

/**
 * `/sitemap.xml` — generated from the app's public route list via `@repo/seo`,
 * one canonical entry per route (the default locale, unprefixed) plus hreflang
 * `alternates.languages` for every configured locale. The home page gets the
 * highest priority. Protected (`/dashboard`) and API routes are intentionally
 * omitted (and disallowed in `robots.ts`).
 */

// URL-prefix routing, "as-needed": the default locale is unprefixed; others get
// a `/<locale>` prefix. Mirrors @repo/i18n routing so a new locale flows through.
function localizedPath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(
    SITE_URL,
    PUBLIC_ROUTES.map((path) => ({
      path,
      changeFrequency: "monthly",
      priority: path === "/" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((locale) => [
            locale,
            absoluteUrl(SITE_URL, localizedPath(locale, path)),
          ]),
        ),
      },
    })),
  );
}
