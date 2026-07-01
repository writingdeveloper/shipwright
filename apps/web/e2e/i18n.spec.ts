import { expect, test } from "./fixtures";

/**
 * i18n e2e against the REAL built app (next-intl locale middleware composed with
 * the nonce CSP + auth rate-limit in proxy.ts). Verifies URL-prefix routing
 * ("as-needed" — default locale unprefixed, /ko prefixed), the LocaleSwitcher,
 * and hreflang. The existing 40 e2e prove the default-locale URLs are unchanged.
 */

test("default locale (en) is served at / with lang=en and English copy", async ({
  page,
}) => {
  await page.goto("/");
  // No redirect off / — "as-needed" keeps the default locale unprefixed.
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  // Home CTA is a Button-as-Link (renders an <a>, role=link).
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("/ko serves Korean with lang=ko", async ({ page }) => {
  await page.goto("/ko");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
});

test("LocaleSwitcher switches language preserving the path", async ({
  page,
}) => {
  await page.goto("/");
  // English → Korean: lands on /ko with Korean copy.
  await page.getByLabel("Language").selectOption("ko");
  await page.waitForURL("**/ko");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
  // Korean → English: back to the unprefixed default URL.
  await page.getByLabel("언어").selectOption("en");
  await page.waitForURL((url) => new URL(url).pathname === "/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("home page emits hreflang alternates for both locales", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[hreflang="en"]')).toHaveCount(1);
  await expect(page.locator('link[hreflang="ko"]')).toHaveCount(1);
});

test("sitemap.xml lists locale hreflang alternates", async ({ page }) => {
  const res = await page.request.get("/sitemap.xml");
  expect(res.ok()).toBeTruthy();
  const xml = await res.text();
  expect(xml).toContain('hreflang="ko"');
});

test("locale-aware links keep the /ko prefix across pages", async ({ page }) => {
  await page.goto("/ko");
  // The home CTA uses the app's locale-aware Link (i18n/navigation), so clicking
  // it from /ko must stay in Korean (/ko/sign-in) — not drop to /sign-in.
  await page.getByRole("link", { name: "로그인" }).click();
  await page.waitForURL("**/ko/sign-in");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});

test("LocaleSwitcher is reachable site-wide (not just the home page)", async ({
  page,
}) => {
  // The switcher now lives in the locale layout, so it's present on inner pages.
  await page.goto("/sign-in");
  await expect(page.getByLabel("Language")).toBeVisible();
});

test("externalized app surfaces render fully in Korean, not just the home page", async ({
  page,
}) => {
  // The whole app's copy is externalized to messages/<locale>.json, so a
  // non-default locale must translate real UI surfaces (a form, its labels and
  // button) — this is what guarantees adding a language is a messages-file drop,
  // with no hardcoded English leaking through.
  await page.goto("/ko/sign-in");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(
    page.getByRole("heading", { name: "다시 오신 것을 환영합니다" }),
  ).toBeVisible();
  await expect(page.getByLabel("이메일")).toBeVisible();
  // exact: the PasswordInput's show/hide toggle also carries "비밀번호 표시".
  await expect(page.getByLabel("비밀번호", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
  // The password show/hide toggle is translated too (proves aria-labels, not
  // just visible text, are externalized).
  await expect(
    page.getByRole("button", { name: "비밀번호 표시" }),
  ).toBeVisible();
});
