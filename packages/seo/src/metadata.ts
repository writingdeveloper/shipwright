import type { Metadata } from "next";

/**
 * @repo/seo — metadata helpers.
 *
 * A thin, opinionated wrapper over Next's `Metadata` object that fills in the
 * OpenGraph + Twitter + canonical boilerplate every page needs, so a consumer
 * only states what is specific to a page (title, description, path) and gets
 * sensible, consistent defaults for the rest. Pure data — it returns a plain
 * `Metadata` object and pulls in no runtime, so it is trivially unit-testable
 * and safe to call from a Server Component, `generateMetadata`, or the root
 * layout.
 */

/** Defaults that describe the site as a whole, set once at the app root. */
export type SeoSiteConfig = {
  /**
   * Human-readable site/application name. Used as the OpenGraph `siteName`, the
   * Twitter/OG fallback title, and the suffix of the title template.
   */
  readonly name: string;
  /** One-line description used when a page does not supply its own. */
  readonly description: string;
  /**
   * Absolute base URL of the deployment (e.g. `https://example.com`). Becomes
   * `metadataBase`, against which every relative `canonical`/`openGraph.url` and
   * image path is resolved into an absolute URL by Next. A string or `URL` is
   * accepted; a string is normalised to a `URL`.
   */
  readonly url: string | URL;
  /**
   * Optional default social-share image, resolved relative to {@link url}.
   * Defaults to `/opengraph-image` (the Next.js file-based OG image convention),
   * which is harmless if no such route exists — crawlers simply find no image.
   */
  readonly defaultImage?: string;
  /** Optional `@handle` (without the leading `@` is also accepted) for Twitter cards. */
  readonly twitterHandle?: string;
  /** Optional search-engine verification tokens (e.g. Google Search Console). */
  readonly verification?: { readonly google?: string };
};

/** Per-page metadata inputs. All optional — omit to inherit the site defaults. */
export type CreateMetadataOptions = {
  /**
   * Page title. Rendered through the title template as `"<title> · <site>"`.
   * Omit on the home page to use the site name verbatim as the default title.
   */
  readonly title?: string;
  /** Page description; falls back to the site description. */
  readonly description?: string;
  /**
   * Path (or absolute URL) of THIS page, used for the canonical link and the
   * OpenGraph URL. A path like `/pricing` is resolved against `metadataBase`.
   * Defaults to `/`.
   */
  readonly path?: string;
  /** Override the share image for this page (resolved against `metadataBase`). */
  readonly image?: string;
  /** OpenGraph type. Defaults to `"website"`. */
  readonly type?: "website" | "article";
  /** Set `true` to tell crawlers not to index this page. */
  readonly noindex?: boolean;
  /** Extra keywords merged into the document metadata. */
  readonly keywords?: readonly string[];
  /**
   * Optional hreflang alternates for this page: language code → path (or URL),
   * resolved against `metadataBase`. Becomes `alternates.languages` so crawlers
   * find the page in each locale. Omit on a single-locale app.
   */
  readonly languages?: Readonly<Record<string, string>>;
  /** Active locale, emitted as `openGraph.locale` (e.g. "en", "ko"). */
  readonly locale?: string;
};

/** Normalise a possible `@handle` into the leading-`@` form Twitter expects. */
function normaliseHandle(handle: string): string {
  return handle.startsWith("@") ? handle : `@${handle}`;
}

/**
 * Build a Next.js {@link Metadata} object for a page from the site config plus
 * the page-specific bits.
 *
 * What it sets up for you:
 * - `metadataBase` + a `title.template` of `"%s · <site>"` and a `title.default`
 *   of the site name, so per-page titles are suffixed consistently and the home
 *   page (no title) shows the bare site name.
 * - `alternates.canonical` and `openGraph.url` from `path` (relative paths are
 *   resolved absolutely by Next via `metadataBase`).
 * - `openGraph` (siteName, title, description, type, image) and a matching
 *   `twitter` `summary_large_image` card, including the optional creator handle.
 * - `robots` set to `noindex, nofollow` when `noindex` is passed.
 */
export function createMetadata(
  site: SeoSiteConfig,
  options: CreateMetadataOptions = {},
): Metadata {
  const {
    title,
    description = site.description,
    path = "/",
    image = site.defaultImage ?? "/opengraph-image",
    type = "website",
    noindex = false,
    keywords,
    languages,
    locale,
  } = options;

  const metadataBase =
    typeof site.url === "string" ? new URL(site.url) : site.url;

  // When a page supplies its own title we emit an ABSOLUTE title (already
  // suffixed with the site name) so it doesn't get double-suffixed by a parent
  // template. With no title (e.g. the root layout) we emit the template + a
  // `default`, so child pages that set only a plain string inherit the suffix.
  const titleValue: NonNullable<Metadata["title"]> = title
    ? { absolute: `${title} · ${site.name}` }
    : { default: site.name, template: `%s · ${site.name}` };

  return {
    metadataBase,
    title: titleValue,
    description,
    ...(keywords && keywords.length > 0 ? { keywords: [...keywords] } : {}),
    applicationName: site.name,
    alternates: {
      canonical: path,
      ...(languages ? { languages: { ...languages } } : {}),
    },
    openGraph: {
      type,
      siteName: site.name,
      title: title ?? site.name,
      description,
      url: path,
      images: [{ url: image }],
      ...(locale ? { locale } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: title ?? site.name,
      description,
      images: [image],
      ...(site.twitterHandle
        ? { creator: normaliseHandle(site.twitterHandle) }
        : {}),
    },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    ...(site.verification?.google
      ? { verification: { google: site.verification.google } }
      : {}),
  };
}
