import type { MetadataRoute } from "next";
import { buildRobots } from "@repo/seo";

import { SITE_URL } from "../lib/site";

/**
 * `/robots.txt` — allow all crawlers, disallow the authenticated app and API
 * surfaces, and point at the absolute sitemap URL (built via `@repo/seo`).
 */
export default function robots(): MetadataRoute.Robots {
  return buildRobots({
    baseUrl: SITE_URL,
    disallow: ["/dashboard", "/api"],
    // Explicitly allow AI/LLM crawlers so the public site can be cited in
    // generative answers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, …).
    aiCrawlers: "allow",
  });
}
