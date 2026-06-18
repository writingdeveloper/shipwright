import type { MetadataRoute } from "next";

/**
 * @repo/seo — helpers for the App Router's `sitemap.ts` and `robots.ts` files.
 *
 * These keep the per-app route files trivial: the app declares its base URL and
 * the list of public paths, and these builders return the exact
 * `MetadataRoute.Sitemap` / `MetadataRoute.Robots` shapes Next serialises into
 * `/sitemap.xml` and `/robots.txt`. Pure functions over strings — no Next
 * runtime — so they unit-test cleanly.
 */

/** Join a base origin and a path into a single absolute URL (no double slash). */
export function absoluteUrl(baseUrl: string | URL, path: string): string {
  const base = (typeof baseUrl === "string" ? baseUrl : baseUrl.href).replace(
    /\/+$/,
    "",
  );
  if (path === "" || path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** One entry in a {@link buildSitemap} call. */
export type SitemapEntry = {
  /** Path (e.g. `/pricing`) or absolute URL. */
  readonly path: string;
  /** Optional last-modified date; defaults to "now" at build time. */
  readonly lastModified?: string | Date;
  readonly changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  /** 0.0–1.0 relative priority. */
  readonly priority?: number;
};

/**
 * Build a `MetadataRoute.Sitemap` from a base URL and a list of public routes.
 * Relative paths are resolved to absolute URLs against `baseUrl` (sitemaps
 * require absolute `loc` values).
 */
export function buildSitemap(
  baseUrl: string | URL,
  entries: readonly SitemapEntry[],
): MetadataRoute.Sitemap {
  const now = new Date();
  return entries.map((entry) => ({
    url: absoluteUrl(baseUrl, entry.path),
    lastModified: entry.lastModified ?? now,
    ...(entry.changeFrequency
      ? { changeFrequency: entry.changeFrequency }
      : {}),
    ...(entry.priority !== undefined ? { priority: entry.priority } : {}),
  }));
}

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
};

/**
 * Build a `MetadataRoute.Robots` allowing all user-agents by default, listing
 * any disallowed paths, and pointing `sitemap` at the absolute sitemap URL.
 */
export function buildRobots(options: BuildRobotsOptions): MetadataRoute.Robots {
  const {
    baseUrl,
    disallow = [],
    allow = ["/"],
    sitemapPath = "/sitemap.xml",
  } = options;

  return {
    rules: {
      userAgent: "*",
      allow: [...allow],
      ...(disallow.length > 0 ? { disallow: [...disallow] } : {}),
    },
    sitemap: absoluteUrl(baseUrl, sitemapPath),
  };
}
