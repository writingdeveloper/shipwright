import type { ComponentProps } from "react";

/**
 * @repo/seo — JSON-LD (schema.org structured data) helpers for the App Router.
 *
 * Two pieces:
 * - builder functions (`organizationJsonLd`, `websiteJsonLd`) that return plain
 *   schema.org objects, so they are pure and unit-testable; and
 * - a `<JsonLd>` server component that serialises such an object into the
 *   `<script type="application/ld+json">` block crawlers read.
 *
 * CSP note: a `type="application/ld+json"` block is a *data* block, not
 * executable JavaScript, so a strict `script-src` (the repo's nonce CSP) does
 * not block it and it needs no nonce. We still render it through Next (a Server
 * Component) rather than injecting raw HTML, keeping it inside the framework's
 * normal output.
 */

/** Minimal shape shared by every schema.org node we emit. */
export type JsonLdObject = Record<string, unknown> & {
  "@context"?: string;
  "@type": string;
};

/** Inputs for {@link organizationJsonLd}. */
export type OrganizationJsonLdOptions = {
  /** Organisation / brand name. */
  readonly name: string;
  /** Absolute site URL (e.g. `https://example.com`). */
  readonly url: string;
  /** Optional absolute logo URL. */
  readonly logo?: string;
  /** Optional one-line description. */
  readonly description?: string;
  /** Optional social / external profile URLs (`sameAs`). */
  readonly sameAs?: readonly string[];
};

/**
 * Build an `Organization` schema.org node — the canonical "who publishes this
 * site" structured-data block. Drop the result into {@link JsonLd}.
 */
export function organizationJsonLd(
  options: OrganizationJsonLdOptions,
): JsonLdObject {
  const { name, url, logo, description, sameAs } = options;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
    ...(logo ? { logo } : {}),
    ...(description ? { description } : {}),
    ...(sameAs && sameAs.length > 0 ? { sameAs: [...sameAs] } : {}),
  };
}

/** Inputs for {@link websiteJsonLd}. */
export type WebSiteJsonLdOptions = {
  /** Site name. */
  readonly name: string;
  /** Absolute site URL. */
  readonly url: string;
  /**
   * Optional search URL template enabling the Sitelinks Search Box, e.g.
   * `https://example.com/search?q={search_term_string}`.
   */
  readonly searchUrlTemplate?: string;
};

/**
 * Build a `WebSite` schema.org node, optionally advertising a site search
 * endpoint via `potentialAction` (Google Sitelinks Search Box).
 */
export function websiteJsonLd(options: WebSiteJsonLdOptions): JsonLdObject {
  const { name, url, searchUrlTemplate } = options;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    ...(searchUrlTemplate
      ? {
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: searchUrlTemplate,
            },
            "query-input": "required name=search_term_string",
          },
        }
      : {}),
  };
}

/** Props for {@link JsonLd}. */
export type JsonLdProps = {
  /** One schema.org node, or several to emit as a list. */
  readonly data: JsonLdObject | readonly JsonLdObject[];
} & Omit<ComponentProps<"script">, "type" | "dangerouslySetInnerHTML">;

/**
 * Render structured data as a `<script type="application/ld+json">` tag.
 *
 * Accepts a single node or an array (emitted as separate tags). The payload is
 * JSON, and `<` is escaped to `<` so a string value can never prematurely
 * close the script element — the standard XSS-safe JSON-LD embedding.
 */
export function JsonLd({ data, ...scriptProps }: JsonLdProps) {
  const nodes = Array.isArray(data) ? data : [data];
  return (
    <>
      {nodes.map((node, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON-LD must be embedded as text; `<` is escaped so a string value
          // can never prematurely close the <script> (XSS-safe).
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(node).replace(/</g, "\\u003c"),
          }}
          {...scriptProps}
        />
      ))}
    </>
  );
}
