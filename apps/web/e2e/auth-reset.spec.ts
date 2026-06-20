import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Password-reset / verification UX — account-free. With no Resend key the reset
 * email no-ops, but the page flow (request → confirmation, invalid-token guard,
 * the sign-in link) still renders and is keyboard/axe-clean.
 */

test("forgot-password renders, has an h1, and confirms after submit", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(page.locator("h1")).toHaveText("Forgot your password?");

  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  // Better Auth returns success regardless (no account enumeration); the email
  // no-ops keyless. The UI moves to the confirmation state.
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
});

test("reset-password without a token shows the invalid-link message", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(page.locator("h1")).toHaveText("Set a new password");
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
});

test("sign-in links to forgot-password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});
