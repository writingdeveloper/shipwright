import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/seo`.
 *
 * Pure unit tests over the metadata / JSON-LD / route builders — they only
 * produce plain objects, so no DOM, server, or Next runtime is needed. The
 * end-to-end proof that `/sitemap.xml`, `/robots.txt`, and the `<head>` metadata
 * actually render lives in the web app's Playwright suite (`test:e2e`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
