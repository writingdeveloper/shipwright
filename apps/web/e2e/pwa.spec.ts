import { expect, test } from "@playwright/test";

/**
 * PWA smoke: the manifest is served and installable-shaped, and the offline
 * fallback renders. Runs with NO VAPID keys (push UI shows "not configured").
 */
test("serves a valid web app manifest", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});

test("offline fallback page renders", async ({ page }) => {
  await page.goto("/offline");
  await expect(
    page.getByRole("heading", { name: /you're offline/i }),
  ).toBeVisible();
});
