import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const PASSWORD = "password1234"; // ≥ 8 (Better Auth minPasswordLength).
const ORIGIN = "http://localhost:3300"; // must match playwright.config webServer

/** Sign up (ignore "already exists" — the DB is shared across specs in a run).
 *  Better Auth's CSRF needs a trusted Origin on the API call. */
async function signUp(request: APIRequestContext, email: string): Promise<void> {
  await request
    .post("/api/auth/sign-up/email", {
      data: { email, password: PASSWORD, name: email },
      headers: { origin: ORIGIN },
    })
    .catch(() => {});
}

/** Ensure admin@example.com exists (ADMIN_EMAILS → role admin) and is signed in. */
async function signInAsAdmin(page: Page): Promise<void> {
  await signUp(page.request, "admin@example.com");
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: "admin@example.com", password: PASSWORD },
    headers: { origin: ORIGIN },
  });
  expect(res.ok()).toBeTruthy();
}

test("an allow-listed admin reaches the gated dashboard", async ({ page }) => {
  // Reaching the dashboard ⟺ role admin ⟺ the create-hook promoted the
  // ADMIN_EMAILS address (a non-admin is bounced — see the next test).
  await signInAsAdmin(page);

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toBeVisible();
  await expect(page.getByTestId("task-count")).toBeVisible();
  await expect(page.getByTestId("sub-count")).toBeVisible();
});

test("a non-admin is bounced from the dashboard (notFound)", async ({
  page,
}) => {
  // Unique, not allow-listed → role user → auto-signed-in by sign-up.
  await signUp(page.request, `normal-${Date.now()}@example.com`);

  await page.goto("/");

  // requireAdmin() → notFound(): the dashboard heading must never render.
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toHaveCount(0);
});

test("the sign-in page logs an admin into the dashboard", async ({ page }) => {
  // Ensure the admin exists, then drop the session so we drive the real sign-in
  // UI from a signed-out state.
  await signInAsAdmin(page);
  await page.request
    .post("/api/auth/sign-out", { headers: { origin: ORIGIN } })
    .catch(() => {});
  await page.context().clearCookies();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toBeVisible();
});
