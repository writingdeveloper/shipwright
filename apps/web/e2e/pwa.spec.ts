import { expect, test } from "./fixtures";

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

/**
 * Service worker runtime (prod only — ServiceWorkerProvider registers on
 * `window.load` when NODE_ENV=production, which the Playwright webServer is).
 * These exercise the actual SW: registration, precache, and offline serving —
 * the part curl can't reach.
 */
test("registers a service worker and precaches the app shell", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      return { supported: false, active: null as string | null, caches: [] as string[] };
    }
    const reg = await navigator.serviceWorker.ready; // resolves once active
    const caches = await window.caches.keys();
    return { supported: true, active: reg.active?.state ?? null, caches };
  });
  expect(result.supported).toBe(true);
  // `ready` resolves once an active worker exists; its state may still be
  // "activating" (the activate handler's clients.claim() is in flight) when read.
  expect(["activating", "activated"]).toContain(result.active);
  // sw.js opens a cache named `shipwright-<version>` and precaches the shell.
  expect(result.caches.some((k) => k.startsWith("shipwright-"))).toBe(true);
});

test("service worker serves the app shell offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // sw.js calls clients.claim() on activate, so it takes control without a reload.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 10_000,
  });
  // Cut the network entirely; the SW must serve the precached shell.
  await context.setOffline(true);
  const resp = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(resp?.status()).toBe(200);
  await context.setOffline(false);
});
