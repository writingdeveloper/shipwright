import { expect, test } from "@playwright/test";

/**
 * End-to-end proof for the @repo/seo + @repo/legal wiring, against the REAL
 * production server (see playwright.config.ts):
 * - `/sitemap.xml` and `/robots.txt` build and return valid content;
 * - the homepage `<head>` carries OpenGraph + title metadata;
 * - the legal pages render; and
 * - the opt-in cookie-consent banner appears, is dismissable, sets a cookie,
 *   and does NOT block the page beneath it.
 */

test("/sitemap.xml returns valid XML listing the public routes", async ({
  request,
  baseURL,
}) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");

  const body = await res.text();
  expect(body).toContain("<urlset");
  // Absolute URLs built from the configured base origin.
  expect(body).toContain(`${baseURL}/</loc>`);
  expect(body).toContain(`${baseURL}/sign-in</loc>`);
  expect(body).toContain(`${baseURL}/privacy</loc>`);
  expect(body).toContain(`${baseURL}/terms</loc>`);
});

test("/robots.txt allows crawling, disallows app/api, and points at the sitemap", async ({
  request,
  baseURL,
}) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);

  const body = await res.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /dashboard");
  expect(body).toContain("Disallow: /api");
  expect(body).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
});

test("homepage <head> carries OpenGraph + title metadata", async ({
  request,
}) => {
  const res = await request.get("/");
  const html = await res.text();

  expect(html).toContain("<title>Shipwright</title>");
  expect(html).toContain('property="og:title"');
  expect(html).toContain('property="og:site_name"');
  expect(html).toContain('content="Shipwright"');
  expect(html).toContain('name="twitter:card"');
  // schema.org structured data injected by <JsonLd>.
  expect(html).toContain('application/ld+json');
  expect(html).toContain('"@type":"Organization"');
});

test("legal pages render with their headings and the not-legal-advice note", async ({
  page,
}) => {
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy Policy", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("NOT legal advice", { exact: false })).toBeVisible();
  // The seeded real sub-processor is listed.
  await expect(page.getByText("Turso", { exact: false })).toBeVisible();

  await page.goto("/terms");
  await expect(
    page.getByRole("heading", { name: "Terms of Service", level: 1 }),
  ).toBeVisible();
});

test("cookie-consent banner appears, dismisses, sets a cookie, and is non-blocking", async ({
  page,
  context,
}) => {
  await page.goto("/");

  const banner = page.getByTestId("cookie-consent");
  await expect(banner).toBeVisible();

  // The page beneath stays interactive while the banner is showing: the footer
  // privacy link is present and clickable (proves the wrapper is click-through).
  // `exact` avoids matching the banner's own "Privacy Policy" link.
  await expect(
    page.getByRole("link", { name: "Privacy", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await page.waitForURL("**/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy Policy", level: 1 }),
  ).toBeVisible();
  await page.goto("/");

  // Accept; the banner goes away and a consent cookie is written.
  await page.getByTestId("cookie-consent-accept").click();
  await expect(banner).toHaveCount(0);

  const cookies = await context.cookies();
  const consent = cookies.find((c) => c.name === "cookie_consent");
  expect(consent, "an accept should set the cookie_consent cookie").toBeTruthy();
  expect(decodeURIComponent(consent!.value)).toContain('"status":"accepted"');

  // It stays dismissed after a reload (cookie persisted).
  await page.reload();
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
});
