import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility scan (axe-core) of the public pages. Guards the a11y
 * fixes (skip-link, headings, focus ring, form labels, reduced-motion) against
 * regressions and surfaces any WCAG 2.0/2.1 A/AA violations objectively.
 * Authenticated pages (the dashboard) are scanned from the signed-in flow in
 * tasks.spec to avoid an extra sign-up tripping the auth rate limiter.
 */
const PUBLIC_PAGES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/offline",
  "/ko",
] as const;

for (const path of PUBLIC_PAGES) {
  test(`a11y: ${path} has no axe-core violations`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    // Surface a readable summary on failure (id + affected node count).
    expect(
      violations.map((v) => `${v.id} (${v.nodes.length})`),
    ).toEqual([]);
  });
}
