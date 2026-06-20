import { expect, test } from "@playwright/test";

/**
 * GEO / launch-meta smoke. Account-free: serves llms.txt, an OG image, an
 * AI-crawler robots policy, a branded 404, and the icon set.
 */
test("serves llms.txt as text/plain", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(await res.text()).toContain("# Shipwright");
});

test("opengraph-image renders a PNG", async ({ request }) => {
  const res = await request.get("/opengraph-image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("robots lists AI crawlers", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(await res.text()).toMatch(/GPTBot/);
});

test("unknown route renders the branded 404", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("favicon (svg) and apple-icon are served", async ({ request }) => {
  expect((await request.get("/icon.svg")).status()).toBe(200);
  expect((await request.get("/apple-icon")).status()).toBe(200);
});
