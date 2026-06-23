import { expect, test } from "./fixtures";

/**
 * a11y / UX guards for the public pages — account-free. Cover the launch-polish
 * fixes: a single descriptive <h1> per page (document outline / screen readers)
 * and the sign-in password show/hide toggle.
 */

test("public pages expose a single descriptive h1", async ({ page }) => {
  for (const [path, heading] of [
    ["/", "Shipwright"],
    ["/sign-in", "Welcome back"],
    ["/sign-up", "Create your account"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveText(heading);
  }
});

test("sign-in password field has a working show/hide toggle", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const pw = page.getByLabel("Password", { exact: true });
  await pw.fill("hunter2");
  await expect(pw).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Show password" }).click();
  await expect(pw).toHaveAttribute("type", "text");

  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(pw).toHaveAttribute("type", "password");
});
