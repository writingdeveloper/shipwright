import { test as base } from "@playwright/test";

/**
 * Shared e2e `test` that gives every test its OWN client IP, so the proxy's auth
 * rate limiter (keyed on the left-most `x-forwarded-for` hop) can't let serial
 * sign-ups/sign-ins throttle each other. Mirrors apps/web/e2e/fixtures.ts.
 */
let counter = 0;
function uniqueClientIp(): string {
  const n = counter++;
  return `10.${(n >> 8) & 0xff}.${n & 0xff}.1`;
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": uniqueClientIp() });
    // This `use` is Playwright's fixture callback, NOT React's `use` hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context);
  },
});

export * from "@playwright/test";
