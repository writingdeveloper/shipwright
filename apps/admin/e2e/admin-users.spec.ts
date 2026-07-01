import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const PASSWORD = "password1234";
// Better Auth's CSRF check requires the request Origin to be a trusted origin
// (the app's baseURL). page.request sends none by default, so we set it; it must
// match the playwright.config webServer origin (PORT 3300).
const ORIGIN = "http://localhost:3300";

/** Sign up (ignore "already exists" — the DB is shared across specs in a run). */
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

test("admin manages users (role / ban / delete) and every action is audited", async ({
  page,
}) => {
  // A fresh target each run keeps this independent of other specs + retries.
  const target = `target-${Date.now()}@example.com`;
  await signUp(page.request, target); // creates the target (role user)
  await signInAsAdmin(page); // page context is now the admin

  // Search narrows the list to the target deterministically (no pagination races).
  await page.goto(`/users?q=${encodeURIComponent(target)}`);
  const row = page.getByTestId(`user-row-${target}`);
  await expect(row).toBeVisible();

  // Promote → admin.
  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(
    page.getByTestId(`user-row-${target}`).getByText("admin", { exact: true }),
  ).toBeVisible();

  // Ban → unban.
  await page.getByTestId(`user-row-${target}`).getByRole("button", { name: "Ban" }).click();
  await expect(page.getByTestId(`user-row-${target}`).getByText("banned")).toBeVisible();
  await page.getByTestId(`user-row-${target}`).getByRole("button", { name: "Unban" }).click();
  await expect(page.getByTestId(`user-row-${target}`).getByText("active")).toBeVisible();

  // Delete (two-click confirm) → row gone.
  await page.getByTestId(`user-row-${target}`).getByRole("button", { name: "Delete" }).click();
  await page.getByTestId(`user-row-${target}`).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId(`user-row-${target}`)).toHaveCount(0);

  // Audit log recorded every action (rows accumulate across tests → .first()).
  await page.goto("/audit");
  await expect(page.getByTestId("audit-row-user.role.set").first()).toBeVisible();
  await expect(page.getByTestId("audit-row-user.ban").first()).toBeVisible();
  await expect(page.getByTestId("audit-row-user.unban").first()).toBeVisible();
  await expect(page.getByTestId("audit-row-user.delete").first()).toBeVisible();

  // The `?action=` filter narrows to one action type (forensic drill-down):
  // filtering to user.ban shows ban rows but excludes the role.set rows.
  await page.goto("/audit?action=user.ban");
  await expect(page.getByTestId("audit-total")).toContainText('matching "user.ban"');
  await expect(page.getByTestId("audit-row-user.ban").first()).toBeVisible();
  await expect(page.getByTestId("audit-row-user.role.set")).toHaveCount(0);

  // A filter with no matches shows zero (proves it's really filtering server-side).
  await page.goto("/audit?action=does.not.exist");
  await expect(page.getByTestId("audit-total")).toContainText("0 actions");
  await expect(page.getByTestId("audit-row-user.ban")).toHaveCount(0);
});

test("an admin cannot act on their own account (self-protection)", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/users?q=admin@example.com");

  const ownRow = page.getByTestId("user-row-admin@example.com");
  await expect(ownRow).toBeVisible();
  await expect(ownRow.getByRole("button", { name: "Make user" })).toBeDisabled();
  await expect(ownRow.getByRole("button", { name: "Ban" })).toBeDisabled();
  await expect(ownRow.getByRole("button", { name: "Delete" })).toBeDisabled();
});

test("a non-admin is bounced from /users", async ({ page }) => {
  const plain = `plain-${Date.now()}@example.com`; // not allow-listed → role user
  await signUp(page.request, plain); // auto-signs-in as the non-admin
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
});
