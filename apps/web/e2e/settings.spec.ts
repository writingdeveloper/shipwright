import { expect, type Page, test } from "./fixtures";

/**
 * Account-settings journeys against the real app: profile rename, password
 * change (with other-session revocation semantics exercised via re-sign-in),
 * and password-confirmed account deletion (GDPR). Each test registers its own
 * user, so they are independent and repeatable without a DB reset.
 */

const PASSWORD = "test-password-123";
const NEW_PASSWORD = "test-password-456";

function uniqueEmail(): string {
  return `settings+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/**
 * Dismiss the opt-in cookie-consent banner. It is a `fixed bottom-0` strip, so
 * on the taller settings page it overlays the bottom "Delete account" button
 * and INTERCEPTS its click — accept it up front (sets the consent cookie) so
 * the rest of the journey has unambiguous click targets. Mirrors tasks.spec.
 */
async function acceptCookies(page: Page): Promise<void> {
  const accept = page.getByTestId("cookie-consent-accept");
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  }
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up");
  await acceptCookies(page);
  await page.getByLabel("Name").fill("Settings User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}

test("authenticated users are bounced from /sign-in and /sign-up to the dashboard", async ({
  page,
}) => {
  await signUp(page, uniqueEmail());

  await page.goto("/sign-in");
  await page.waitForURL("**/dashboard");
  await page.goto("/sign-up");
  await page.waitForURL("**/dashboard");
});

test("profile: rename persists and the sessions card lists this device", async ({
  page,
}) => {
  await signUp(page, uniqueEmail());

  // Dashboard header links to settings.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/settings");

  // Rename → inline success → persists across a reload.
  await page.getByLabel("Name").fill("Renamed User");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name updated.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Renamed User");

  // Exactly this sign-in's session, marked as the current device; nothing to
  // revoke elsewhere.
  const sessions = page.getByTestId("sessions-list").getByRole("listitem");
  await expect(sessions).toHaveCount(1);
  await expect(sessions.first()).toContainText("this device");
  await expect(
    page.getByRole("button", { name: /Sign out other sessions/ }),
  ).toBeDisabled();
});

test("password change: old password stops working, the new one signs in", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signUp(page, email);

  await page.goto("/settings");
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  // A WRONG current password is rejected inline (server-verified).
  await page.getByLabel("Current password").fill("wrong-password-1");
  await page.getByLabel("New password").fill("another-password-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByTestId("password-card").getByRole("alert"),
  ).toBeVisible();

  // Sign out, prove the OLD password is dead and the NEW one works.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/sign-in");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
});

test("account deletion: wrong password rejected; correct password deletes for good", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signUp(page, email);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account…" }).click();

  // Wrong password → inline rejection, account still alive.
  await page.getByLabel("Confirm with your password").fill("wrong-password-1");
  await page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await expect(
    page.getByTestId("danger-card").getByRole("alert"),
  ).toBeVisible();

  // Correct password → deleted, bounced to the public home page.
  await page.getByLabel("Confirm with your password").fill(PASSWORD);
  await page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await page.waitForURL((url) => !url.pathname.includes("/settings"));

  // The dashboard is gated again…
  await page.goto("/dashboard");
  await page.waitForURL("**/sign-in");

  // …and the credentials are gone for good.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
