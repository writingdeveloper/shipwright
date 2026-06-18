import { describe, expect, it } from "vitest";

import { createMetadata } from "../src/metadata";
import { organizationJsonLd, websiteJsonLd } from "../src/json-ld";
import { absoluteUrl, buildRobots, buildSitemap } from "../src/routes";

/**
 * Unit guards for the SEO builders. They pin the contract the web app's
 * layout/sitemap/robots depend on: a canonical + OG/Twitter metadata object, a
 * valid schema.org node, and absolute sitemap/robots URLs.
 */

const site = {
  name: "Shipwright",
  description: "Ship MVPs fast.",
  url: "https://example.com",
  twitterHandle: "shipwright",
} as const;

describe("createMetadata", () => {
  it("sets metadataBase, a title template, and the bare site name as default", () => {
    const meta = createMetadata(site);
    expect(meta.metadataBase).toBeInstanceOf(URL);
    expect(meta.metadataBase?.href).toBe("https://example.com/");
    expect(meta.title).toEqual({
      default: "Shipwright",
      template: "%s · Shipwright",
    });
  });

  it("emits an absolute, suffixed title for a page with its own title", () => {
    const meta = createMetadata(site, { title: "Pricing", path: "/pricing" });
    expect(meta.title).toEqual({ absolute: "Pricing · Shipwright" });
    expect(meta.alternates?.canonical).toBe("/pricing");
  });

  it("builds OpenGraph + a summary_large_image Twitter card with the creator", () => {
    const meta = createMetadata(site, { title: "Pricing", path: "/pricing" });
    expect(meta.openGraph).toMatchObject({
      type: "website",
      siteName: "Shipwright",
      title: "Pricing",
      url: "/pricing",
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      creator: "@shipwright",
    });
  });

  it("honours noindex", () => {
    expect(createMetadata(site, { noindex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
    expect(createMetadata(site).robots).toEqual({ index: true, follow: true });
  });
});

describe("json-ld builders", () => {
  it("organizationJsonLd returns a valid Organization node", () => {
    const node = organizationJsonLd({
      name: "Shipwright",
      url: "https://example.com",
      sameAs: ["https://github.com/x"],
    });
    expect(node["@context"]).toBe("https://schema.org");
    expect(node["@type"]).toBe("Organization");
    expect(node.name).toBe("Shipwright");
    expect(node.sameAs).toEqual(["https://github.com/x"]);
  });

  it("websiteJsonLd adds a SearchAction only when a template is given", () => {
    expect(
      websiteJsonLd({ name: "S", url: "https://example.com" }).potentialAction,
    ).toBeUndefined();
    const withSearch = websiteJsonLd({
      name: "S",
      url: "https://example.com",
      searchUrlTemplate: "https://example.com/s?q={search_term_string}",
    });
    expect(withSearch.potentialAction).toBeDefined();
  });
});

describe("routes builders", () => {
  it("absoluteUrl joins without double slashes and handles root", () => {
    expect(absoluteUrl("https://example.com/", "/pricing")).toBe(
      "https://example.com/pricing",
    );
    expect(absoluteUrl("https://example.com", "pricing")).toBe(
      "https://example.com/pricing",
    );
    expect(absoluteUrl("https://example.com", "/")).toBe("https://example.com/");
  });

  it("buildSitemap resolves every path to an absolute URL", () => {
    const sitemap = buildSitemap("https://example.com", [
      { path: "/" },
      { path: "/sign-in", priority: 0.5 },
    ]);
    expect(sitemap.map((e) => e.url)).toEqual([
      "https://example.com/",
      "https://example.com/sign-in",
    ]);
    expect(sitemap[0]?.lastModified).toBeInstanceOf(Date);
    expect(sitemap[1]?.priority).toBe(0.5);
  });

  it("buildRobots allows all, lists disallows, and points sitemap absolutely", () => {
    const robots = buildRobots({
      baseUrl: "https://example.com",
      disallow: ["/dashboard", "/api"],
    });
    expect(robots.sitemap).toBe("https://example.com/sitemap.xml");
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    expect(rule?.userAgent).toBe("*");
    expect(rule?.disallow).toEqual(["/dashboard", "/api"]);
  });
});
