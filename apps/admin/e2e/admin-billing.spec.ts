import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const PASSWORD = "password1234";
const ORIGIN = "http://localhost:3300"; // must match playwright.config webServer

async function signUp(request: APIRequestContext, email: string): Promise<void> {
  await request
    .post("/api/auth/sign-up/email", {
      data: { email, password: PASSWORD, name: email },
      headers: { origin: ORIGIN },
    })
    .catch(() => {});
}

async function signInAsAdmin(page: Page): Promise<void> {
  await signUp(page.request, "admin@example.com");
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: "admin@example.com", password: PASSWORD },
    headers: { origin: ORIGIN },
  });
  expect(res.ok()).toBeTruthy();
}

test("admin grants and revokes a Pro comp (keyless), audited; Stripe controls disabled", async ({
  page,
}) => {
  const target = `billing-${Date.now()}@example.com`;
  await signUp(page.request, target);
  await signInAsAdmin(page);

  // Open the target's detail page via the Manage link.
  await page.goto(`/users?q=${encodeURIComponent(target)}`);
  await page
    .getByTestId(`user-row-${target}`)
    .getByRole("link", { name: "Manage" })
    .click();
  await expect(page.getByRole("heading", { name: target })).toBeVisible();

  // Free to start; Stripe controls disabled (no key in e2e).
  await expect(page.getByTestId("sub-summary")).toHaveText(
    "No subscription (free)",
  );
  await expect(
    page.getByRole("button", { name: "Refund last payment" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Extend" })).toBeDisabled();

  // Grant Pro (local comp) → summary shows comp/active.
  await page.getByRole("button", { name: "Grant Pro" }).click();
  await expect(page.getByTestId("sub-summary")).toContainText("comp");
  await expect(page.getByTestId("sub-summary")).toContainText("active");

  // Revoke → no longer active.
  await page.getByRole("button", { name: "Revoke Pro" }).click();
  await expect(page.getByTestId("sub-summary")).toContainText("canceled");

  // Audit recorded both comp actions.
  await page.goto("/audit");
  await expect(
    page.getByTestId("audit-row-billing.comp.grant").first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("audit-row-billing.comp.revoke").first(),
  ).toBeVisible();
});
