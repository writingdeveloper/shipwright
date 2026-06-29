import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "./fixtures";

const PASSWORD = "password1234"; // ≥ 8 (Better Auth minPasswordLength).

/**
 * Sign up via the Better Auth API. This auto-creates a session in the page's
 * browser context (page.request shares the context cookie jar), so a subsequent
 * `page.goto` is authenticated as this user — exactly what we need to exercise
 * `requireAdmin` against a REAL session.
 */
async function signUp(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const res = await request.post("/api/auth/sign-up/email", {
    data: { email, password: PASSWORD, name: email },
  });
  expect(res.ok()).toBeTruthy();
}

test("an allow-listed email is promoted to admin and reaches the gated dashboard", async ({
  page,
}) => {
  // ADMIN_EMAILS=admin@example.com → the create-hook promotes this user to admin.
  await signUp(page.request, "admin@example.com");

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
  await signUp(page.request, "normal-user@example.com"); // not allow-listed

  await page.goto("/");

  // requireAdmin() → notFound(): the dashboard heading must never render.
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toHaveCount(0);
});

test("the sign-in page logs an existing admin into the dashboard", async ({
  page,
}) => {
  // Create the admin, then drop the auto-session so we drive the real sign-in UI
  // from a signed-out state.
  await signUp(page.request, "admin@example.com").catch(() => {
    // May already exist from the first test (shared DB, serial run) — fine.
  });
  await page.request.post("/api/auth/sign-out").catch(() => {});
  await page.context().clearCookies();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toBeVisible();
});
