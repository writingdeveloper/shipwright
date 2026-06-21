import { describe, expect, it } from "vitest";

import { createMetadata } from "../src/metadata";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "../src/json-ld";
import {
  absoluteUrl,
  buildLlmsTxt,
  buildRobots,
  buildSitemap,
} from "../src/routes";

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

  it("passes languages through to alternates.languages", () => {
    const meta = createMetadata(site, { languages: { ko: "/ko" } });
    expect(meta.alternates?.languages).toEqual({ ko: "/ko" });
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

  it("buildSitemap preserves alternates.languages in the returned entry", () => {
    const sitemap = buildSitemap("https://x", [
      {
        path: "/",
        alternates: {
          languages: { en: "https://x/", ko: "https://x/ko" },
        },
      },
    ]);
    expect(sitemap[0]?.alternates?.languages).toEqual({
      en: "https://x/",
      ko: "https://x/ko",
    });
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

  it("emits explicit AI-crawler rules when aiCrawlers is set", () => {
    const allow = buildRobots({
      baseUrl: "https://example.com",
      disallow: ["/dashboard"],
      aiCrawlers: "allow",
    });
    const allowRules = Array.isArray(allow.rules) ? allow.rules : [allow.rules];
    const agents = allowRules.flatMap((r) =>
      Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent],
    );
    expect(agents).toContain("GPTBot");
    expect(agents).toContain("ClaudeBot");
    expect(agents).toContain("PerplexityBot");
    expect(agents).toContain("Google-Extended");
    expect(agents).toContain("*");

    const block = buildRobots({
      baseUrl: "https://example.com",
      aiCrawlers: "disallow",
    });
    const blockRules = Array.isArray(block.rules) ? block.rules : [block.rules];
    const gpt = blockRules.find((r) =>
      (Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent]).includes(
        "GPTBot",
      ),
    );
    expect(gpt?.disallow).toEqual(["/"]);
  });

  it("buildLlmsTxt renders title, description, and section links", () => {
    const txt = buildLlmsTxt({
      name: "Acme",
      description: "Acme does things",
      url: "https://acme.com",
      sections: [
        {
          title: "Docs",
          links: [
            { title: "Intro", url: "https://acme.com/intro", note: "start" },
          ],
        },
      ],
    });
    expect(txt).toContain("# Acme");
    expect(txt).toContain("> Acme does things");
    expect(txt).toContain("## Docs");
    expect(txt).toContain("[Intro](https://acme.com/intro): start");
  });
});

describe("createMetadata verification", () => {
  it("emits google-site-verification when set, omits when not", () => {
    expect(
      createMetadata({ ...site, verification: { google: "tok123" } })
        .verification?.google,
    ).toBe("tok123");
    expect(createMetadata(site).verification).toBeUndefined();
  });
});

describe("extended json-ld builders", () => {
  it("articleJsonLd builds an Article node", () => {
    const a = articleJsonLd({
      headline: "Hi",
      url: "https://x/p",
      datePublished: "2026-01-01",
    });
    expect(a["@type"]).toBe("Article");
    expect(a.headline).toBe("Hi");
  });
  it("faqJsonLd builds a FAQPage", () => {
    const f = faqJsonLd([{ question: "Q?", answer: "A." }]);
    expect(f["@type"]).toBe("FAQPage");
    expect((f.mainEntity as unknown[]).length).toBe(1);
  });
  it("breadcrumbJsonLd builds a BreadcrumbList with positions", () => {
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
