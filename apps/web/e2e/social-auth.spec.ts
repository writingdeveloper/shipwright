import { expect, test } from "@playwright/test";

/**
 * Graceful contract: with no NEXT_PUBLIC_*_CLIENT_ID set (the keyless default),
 * sign-in/up show NO social button — only the email/password form — so existing
 * flows are untouched. (The real OAuth round-trip needs provider credentials +
 * an external redirect; that is a deployment-time check.)
 */
test("sign-in shows no social button when no provider is configured", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with/ }),
  ).toHaveCount(0);
});

test("sign-up shows no social button when no provider is configured", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with/ }),
  ).toHaveCount(0);
});
