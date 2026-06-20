import { expect, type Page, test } from "@playwright/test";

/**
 * Canonical end-to-end user journey against the REAL app (production build,
 * real Better Auth, real libSQL test DB — see playwright.config.ts).
 *
 * A unique email per run keeps the suite repeatable without a DB reset between
 * runs. The whole journey is one serial test so the authenticated session and
 * the task it creates carry across steps.
 */

const PASSWORD = "test-password-123";

function uniqueEmail(): string {
  return `user+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/**
 * Dismiss the opt-in cookie-consent banner once per browser context.
 *
 * The banner is non-blocking (a click-through bottom strip), but accepting it
 * up front sets the consent cookie so it never renders again for the rest of
 * the journey, keeping the click targets unambiguous regardless of viewport.
 */
async function acceptCookies(page: Page): Promise<void> {
  const accept = page.getByTestId("cookie-consent-accept");
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  }
}

test.describe.configure({ mode: "serial" });

test("sign up → add → toggle → delete → sign out → sign back in", async ({
  page,
}) => {
  const email = uniqueEmail();
  const taskTitle = `Buy milk ${Date.now()}`;

  // 1. Register and land authenticated on the dashboard.
  await page.goto("/sign-up");
  await acceptCookies(page);
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: "Tasks" }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  // Empty state present before adding anything.
  await expect(page.getByText("No tasks yet")).toBeVisible();

  // 2. Add a task; assert it appears.
  await page.getByLabel("Task title").fill(taskTitle);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const taskItem = page.getByRole("listitem").filter({ hasText: taskTitle });
  await expect(taskItem).toBeVisible();
  await expect(page.getByText("No tasks yet")).toHaveCount(0);

  // 3. Toggle complete; assert completed state (checkbox checked + line-through).
  const checkbox = taskItem.getByRole("checkbox");
  await expect(checkbox).not.toBeChecked();

  // Clicking the Radix checkbox calls requestSubmit() on its form, POSTing to
  // the `toggleTask` server action. Wait for that POST to resolve so the write
  // + revalidation have happened before we assert.
  const togglePost = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.status() === 200,
  );
  await checkbox.click();
  await togglePost;

  // Reload to prove the new state is the server/DB-backed truth, not just
  // Radix's optimistic local flip.
  await page.reload();
  await page.waitForURL("**/dashboard");

  const toggledItem = page
    .getByRole("listitem")
    .filter({ hasText: taskTitle });
  await expect(toggledItem.getByRole("checkbox")).toBeChecked();
  const titleSpan = toggledItem.locator("span", { hasText: taskTitle });
  await expect(titleSpan).toHaveClass(/line-through/);

  // 4. Delete it; assert it's gone (empty state returns).
  await page
    .getByRole("button", { name: `Delete "${taskTitle}"` })
    .click();
  await expect(
    page.getByRole("listitem").filter({ hasText: taskTitle }),
  ).toHaveCount(0);
  await expect(page.getByText("No tasks yet")).toBeVisible();

  // 5. Sign out; assert redirect to a public page (sign-in) and that the
  //    dashboard is now gated.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/sign-in");
  await expect(
    page.getByRole("button", { name: "Sign in" }),
  ).toBeVisible();

  // 7 (security): visiting /dashboard while signed out redirects to /sign-in.
  await page.goto("/dashboard");
  await page.waitForURL("**/sign-in");
  // CardTitle renders a <div>, so match by text rather than heading role.
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  // 6. Sign back in; assert the dashboard loads again for this user.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: "Tasks" }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test("persistence: a task survives a sign-out / sign-in cycle", async ({
  page,
}) => {
  const email = uniqueEmail();
  const taskTitle = `Persisted task ${Date.now()}`;

  // Register.
  await page.goto("/sign-up");
  await acceptCookies(page);
  await page.getByLabel("Name").fill("Persist User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");

  // Add a task.
  await page.getByLabel("Task title").fill(taskTitle);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: taskTitle }),
  ).toBeVisible();

  // Sign out.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/sign-in");

  // Sign back in.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");

  // The task is still there — it was persisted in the database.
  await expect(
    page.getByRole("listitem").filter({ hasText: taskTitle }),
  ).toBeVisible();

  // The opt-in tRPC demo card (@repo/api) reads the same tasks over the tRPC
  // client and shows a non-zero count — proving the query path end-to-end.
  await expect(page.getByTestId("trpc-task-card")).toBeVisible();
  await expect(page.getByTestId("trpc-task-count")).toContainText(
    "1 task(s) loaded over tRPC",
  );
});

test("add-task: blank title is rejected inline; a valid title clears the field", async ({
  page,
}) => {
  const email = uniqueEmail();

  await page.goto("/sign-up");
  await acceptCookies(page);
  await page.getByLabel("Name").fill("UX User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("No tasks yet")).toBeVisible();

  // Whitespace-only passes the browser `required` check but the action rejects
  // it — the user gets an inline reason instead of a silent no-op, and no row
  // is created.
  await page.getByLabel("Task title").fill("   ");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Please enter a task title.")).toBeVisible();
  await expect(page.getByText("No tasks yet")).toBeVisible();

  // A valid title is added AND the input is cleared for the next entry.
  const title = `UX task ${Date.now()}`;
  await page.getByLabel("Task title").fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: title }),
  ).toBeVisible();
  await expect(page.getByLabel("Task title")).toHaveValue("");
});
