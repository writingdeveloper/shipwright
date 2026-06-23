import { test as base } from "@playwright/test";

/**
 * Shared e2e `test` that gives every test its OWN client IP.
 *
 * The proxy's auth rate limiter keys on the left-most `x-forwarded-for` hop
 * (`apps/web/proxy.ts`). Browser-driven specs run locally with no proxy, so
 * without this they ALL key under `127.0.0.1` — their sign-ups / sign-ins then
 * accumulate across the serial suite (and CI retries) and eventually trip the
 * 10-per-10s limit, which surfaced as the long-standing flaky `tasks.spec`
 * sign-up timeout. Stamping a unique `x-forwarded-for` per test gives each test a
 * private limiter bucket, so normal flows can never throttle each other.
 *
 * `security-ratelimit.spec.ts` deliberately does NOT use this `test` — it sets its
 * own synthetic IPs to prove the limiter trips (429) and is per-key.
 *
 * Re-exports everything else from `@playwright/test` (expect, devices, types, …)
 * so a spec only swaps its import source.
 */

// Monotonic per-test counter (workers: 1, so a single shared module instance) →
// a unique 10.x.x.1 address per test, away from 127.0.0.1 and the security spec's
// 203.0.113.* / 198.51.100.* ranges. A re-run on retry gets a fresh IP too.
let counter = 0;
function uniqueClientIp(): string {
  const n = counter++;
  return `10.${(n >> 8) & 0xff}.${n & 0xff}.1`;
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": uniqueClientIp() });
    // This `use` is Playwright's fixture callback, NOT React's `use` hook — the
    // react-hooks rule can't tell them apart in a .ts fixture file.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context);
  },
});

export * from "@playwright/test";
