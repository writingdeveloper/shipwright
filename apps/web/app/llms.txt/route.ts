import { buildLlmsTxt } from "@repo/seo";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/site";

/**
 * `/llms.txt` — the emerging standard giving AI systems a curated, LLM-readable
 * index of the site. Served as `text/plain` markdown via `@repo/seo`.
 */
export function GET(): Response {
  const body = buildLlmsTxt({
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    sections: [
      {
        title: "Pages",
        links: [
          { title: "Home", url: `${SITE_URL}/`, note: "product overview" },
          { title: "Privacy", url: `${SITE_URL}/privacy` },
          { title: "Terms", url: `${SITE_URL}/terms` },
        ],
      },
    ],
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
