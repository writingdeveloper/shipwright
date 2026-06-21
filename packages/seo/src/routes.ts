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
  /**
   * Optional hreflang alternates: a map of language code → absolute URL for this
   * page in each locale. Serialised by Next into `<xhtml:link rel="alternate">`
   * entries so crawlers index every language.
   */
  readonly alternates?: { readonly languages: Readonly<Record<string, string>> };
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
    ...(entry.alternates
      ? { alternates: { languages: { ...entry.alternates.languages } } }
      : {}),
  }));
}

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
   * (so they can cite the public site); `"disallow"` blocks them entirely. Omit
   * to leave them under the `*` rule (which already allows them).
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
      lines.push(
        `- [${link.title}](${link.url})${link.note ? `: ${link.note}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
