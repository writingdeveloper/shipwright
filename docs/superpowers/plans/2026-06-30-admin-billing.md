# Admin Billing — Refunds, Extensions, Pro Comp (SP3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin app per-user billing remediation — Stripe refund + extend (keyless-graceful) and a local Pro "comp" grant/revoke — each `requireAdmin`-gated and audited.

**Architecture:** A new `@repo/payments/src/admin.ts` with four server-only functions: refund/extend (call the lazy Stripe client; no-op when unconfigured) and grantProComp/revokeProComp (local `subscription` upsert/update, keyless). The admin app gets Server Actions + a `/users/[userId]` detail page.

**Tech Stack:** Stripe Node SDK ^22, Drizzle (libSQL + pg), Next 16 (Server Actions), Vitest (mocked Stripe + temp libSQL), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-30-admin-billing-design.md`
**Branch:** `feat/admin-billing` (already created).

**Verified ground truth (hardcoded below):**
- `@repo/payments/src/client.ts`: `getStripe(): Stripe | null`, `isStripeConfigured(): boolean`, re-exports `type Stripe`.
- `subscription` table (`@repo/db`): `userId` (unique), `stripeCustomerId`, `stripeSubscriptionId`, `status`, `priceId`, `plan`, `currentPeriodEnd`, … `isPro` = status `active`/`trialing` AND period not lapsed.
- `subscription` IS an owner table → a `.update(subscriptionTable)` MUST use `ownedBy(...)` to satisfy `no-unscoped-owner-table` (insert is not flagged). `@repo/db` does NOT yet export `isNull` (Task 1 adds it).
- Stripe `current_period_end` may be top-level or on `items.data[0]` (the webhook's `periodEndMs` reads either) — read it defensively.
- payments tests: `prepareTestDatabase()` sets `DATABASE_URL` + db:push, THEN dynamic-import the module so the `@repo/db` singleton binds to the temp db; `test/setup.ts` sets `SKIP_ENV_VALIDATION` + a default db url. Mock the Stripe client with `vi.mock("../src/client", …)`.

---

## File Structure
**Create:** `packages/payments/src/admin.ts`, `packages/payments/test/admin.test.ts`, `packages/payments/test/admin-stripe.test.ts`, `apps/admin/lib/billing-actions.ts`, `apps/admin/app/users/[userId]/page.tsx`, `apps/admin/e2e/admin-billing.spec.ts`.
**Modify:** `packages/db/src/index.ts` (export `isNull`), `packages/payments/src/index.ts` (export the 4 fns + `isStripeConfigured`), `apps/admin/app/users/page.tsx` ("Manage" link).

---

## Task 1: Export `isNull` from `@repo/db`

**Files:** `packages/db/src/index.ts`

- [ ] **Step 1: Add `isNull` to the operator re-exports.** Change:
```ts
export { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
```
to:
```ts
export { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm --filter @repo/db check-types && pnpm --filter @repo/db lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "feat(db): re-export isNull operator"
```

---

## Task 2: `@repo/payments` admin functions + comp/keyless tests (TDD)

**Files:** `packages/payments/test/admin.test.ts` (create), `packages/payments/src/admin.ts` (create), `packages/payments/src/index.ts` (modify)

- [ ] **Step 1: Write the failing test** — `packages/payments/test/admin.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareTestDatabase, type PreparedTestDb } from "./db-helper";

/**
 * Local Pro-comp invariants + the keyless no-op of the Stripe ops, against a REAL
 * temp libSQL db. Stripe keys are scrubbed BEFORE the modules import so
 * `isStripeConfigured()` is deterministically false here (the mocked-Stripe path
 * lives in admin-stripe.test.ts).
 */
let prepared: PreparedTestDb;
let admin: typeof import("../src/admin");
let getSubscription: typeof import("../src/subscription").getSubscription;
let isPro: typeof import("../src/subscription").isPro;
let dbMod: typeof import("@repo/db");

beforeAll(async () => {
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) delete process.env[k];
  prepared = prepareTestDatabase();
  admin = await import("../src/admin");
  ({ getSubscription, isPro } = await import("../src/subscription"));
  dbMod = await import("@repo/db");
  await dbMod.db.insert(dbMod.schema.user).values([
    { id: "u-comp", email: "comp@example.com", name: "Comp" },
    { id: "u-real", email: "real@example.com", name: "Real" },
  ]);
}, 90_000);

afterAll(() => prepared?.cleanup());

describe("grant/revoke Pro comp (local, keyless)", () => {
  it("grant makes isPro true (plan 'comp'); revoke makes it false", async () => {
    expect(await isPro("u-comp")).toBe(false);

    expect(await admin.grantProComp("u-comp", 30)).toEqual({ ok: true });
    expect(await isPro("u-comp")).toBe(true);
    const sub = await getSubscription("u-comp");
    expect(sub?.plan).toBe("comp");
    expect(sub?.status).toBe("active");

    expect(await admin.revokeProComp("u-comp")).toEqual({ ok: true });
    expect(await isPro("u-comp")).toBe(false);
  });

  it("revoke does NOT cancel a real Stripe subscription row", async () => {
    await dbMod.db.insert(dbMod.schema.subscription).values({
      userId: "u-real",
      stripeSubscriptionId: "sub_real_1",
      status: "active",
      plan: "pro",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
    });
    expect(await isPro("u-real")).toBe(true);
    await admin.revokeProComp("u-real"); // guarded: only local comps (no stripe id)
    expect(await isPro("u-real")).toBe(true); // untouched
  });
});

describe("refund/extend (no Stripe key → not_configured)", () => {
  it("refundLatestPayment no-ops", async () => {
    expect(await admin.refundLatestPayment("sub_x")).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
  it("extendSubscription no-ops", async () => {
    expect(await admin.extendSubscription("sub_x", 7)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/payments test -- admin.test`
Expected: FAIL — cannot resolve `../src/admin`.

- [ ] **Step 3: Create `packages/payments/src/admin.ts`**

```ts
import {
  and,
  db,
  isNull,
  ownedBy,
  subscription as subscriptionTable,
} from "@repo/db";
import { logger } from "@repo/observability/logger";

import { getStripe, isStripeConfigured } from "./client";

/** Outcome of an admin billing operation. */
export type BillingResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "no_subscription" | "stripe_error" };

const DAY_SECONDS = 60 * 60 * 24;

/**
 * Refund (in full) the latest payment on a user's Stripe subscription. No-op when
 * Stripe is unconfigured or the user has no Stripe subscription / payment.
 */
export async function refundLatestPayment(
  stripeSubscriptionId: string | null,
): Promise<BillingResult> {
  if (!isStripeConfigured()) return { ok: false, reason: "not_configured" };
  if (!stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "not_configured" };
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["latest_invoice.payment_intent"],
    });
    // Focused cast (matches the webhook's periodEndMs pattern) to avoid wrestling
    // the SDK's deep expand types.
    const rec = sub as unknown as {
      latest_invoice?:
        | { payment_intent?: { id?: string } | string | null }
        | string
        | null;
    };
    const inv = rec.latest_invoice;
    const pi = inv && typeof inv === "object" ? inv.payment_intent : null;
    const paymentIntentId = pi
      ? typeof pi === "string"
        ? pi
        : (pi.id ?? null)
      : null;
    if (!paymentIntentId) return { ok: false, reason: "no_subscription" };
    await stripe.refunds.create({ payment_intent: paymentIntentId });
    return { ok: true };
  } catch (error) {
    logger.error("refundLatestPayment failed", { error, stripeSubscriptionId });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Push a Stripe subscription's next billing date out by `days` (free extension)
 * via `trial_end`, no proration. No-op when unconfigured / no subscription.
 */
export async function extendSubscription(
  stripeSubscriptionId: string | null,
  days: number,
): Promise<BillingResult> {
  if (!isStripeConfigured()) return { ok: false, reason: "not_configured" };
  if (!stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  if (!Number.isFinite(days) || days <= 0) {
    return { ok: false, reason: "stripe_error" };
  }
  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "not_configured" };
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const rec = sub as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const currentEnd =
      rec.current_period_end ?? rec.items?.data?.[0]?.current_period_end;
    if (typeof currentEnd !== "number") {
      return { ok: false, reason: "stripe_error" };
    }
    await stripe.subscriptions.update(stripeSubscriptionId, {
      trial_end: currentEnd + Math.floor(days) * DAY_SECONDS,
      proration_behavior: "none",
    });
    return { ok: true };
  } catch (error) {
    logger.error("extendSubscription failed", { error, stripeSubscriptionId });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * LOCAL Pro comp: upsert the user's subscription mirror to an active "comp" for
 * `days`, making `isPro` true. No Stripe call; `stripeSubscriptionId` stays null
 * (it is a manual override). A later real Stripe subscription reconciles via the
 * webhook upsert.
 */
export async function grantProComp(
  userId: string,
  days: number,
): Promise<BillingResult> {
  if (!userId || !Number.isFinite(days) || days <= 0) {
    return { ok: false, reason: "stripe_error" };
  }
  const currentPeriodEnd = new Date(
    Date.now() + Math.floor(days) * DAY_SECONDS * 1000,
  );
  await db
    .insert(subscriptionTable)
    .values({ userId, status: "active", plan: "comp", currentPeriodEnd })
    .onConflictDoUpdate({
      target: subscriptionTable.userId,
      set: {
        status: "active",
        plan: "comp",
        currentPeriodEnd,
        stripeSubscriptionId: null,
      },
    });
  return { ok: true };
}

/**
 * Revoke a LOCAL comp only: cancel the user's subscription row IF it has no
 * `stripeSubscriptionId` (so a real paying subscription is never silently
 * killed). Owner-scoped by `userId` via `ownedBy` (required by the lint rule).
 */
export async function revokeProComp(userId: string): Promise<BillingResult> {
  if (!userId) return { ok: false, reason: "stripe_error" };
  await db
    .update(subscriptionTable)
    .set({ status: "canceled" })
    .where(
      and(
        ownedBy(subscriptionTable, userId),
        isNull(subscriptionTable.stripeSubscriptionId),
      ),
    );
  return { ok: true };
}
```

- [ ] **Step 4: Export from `packages/payments/src/index.ts`** — append a block (and ensure `isStripeConfigured` is exported for the admin UI):

```ts
export {
  refundLatestPayment,
  extendSubscription,
  grantProComp,
  revokeProComp,
  type BillingResult,
} from "./admin";
export { isStripeConfigured } from "./client";
```
(If `isStripeConfigured` is already re-exported from index, skip that line — run `grep -n "isStripeConfigured" packages/payments/src/index.ts` first; only add it if absent.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @repo/payments test -- admin.test`
Expected: PASS — comp grant/revoke flip `isPro`, revoke spares the real-Stripe row, refund/extend no-op `not_configured`.

- [ ] **Step 6: Type-check + lint** (the `.update(subscriptionTable)` uses `ownedBy`, so the lint rule is satisfied)

Run: `pnpm --filter @repo/payments check-types && pnpm --filter @repo/payments lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/payments/src/admin.ts packages/payments/src/index.ts packages/payments/test/admin.test.ts
git commit -m "feat(payments): admin billing — refund/extend (keyless-graceful) + local Pro comp"
```

---

## Task 3: Mocked-Stripe tests for refund/extend

**Files:** `packages/payments/test/admin-stripe.test.ts` (create)

- [ ] **Step 1: Create `packages/payments/test/admin-stripe.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";

// Mock the lazy Stripe client so refund/extend take the CONFIGURED path against a
// fake Stripe and we can assert the exact call shapes — no network, no keys.
const refundsCreate = vi.fn().mockResolvedValue({ id: "re_1" });
const subsUpdate = vi.fn().mockResolvedValue({});
const subsRetrieve = vi.fn();

vi.mock("../src/client", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    subscriptions: { retrieve: subsRetrieve, update: subsUpdate },
    refunds: { create: refundsCreate },
  }),
}));

describe("refund/extend (mocked Stripe)", () => {
  it("refundLatestPayment refunds the latest payment_intent", async () => {
    subsRetrieve.mockResolvedValueOnce({
      latest_invoice: { payment_intent: { id: "pi_123" } },
    });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({ ok: true });
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_123" });
  });

  it("extendSubscription pushes trial_end out by N days, no proration", async () => {
    subsRetrieve.mockResolvedValueOnce({ current_period_end: 1000 });
    const { extendSubscription } = await import("../src/admin");

    expect(await extendSubscription("sub_1", 7)).toEqual({ ok: true });
    expect(subsUpdate).toHaveBeenCalledWith("sub_1", {
      trial_end: 1000 + 7 * 86400,
      proration_behavior: "none",
    });
  });

  it("refund returns no_subscription when there is no payment intent", async () => {
    subsRetrieve.mockResolvedValueOnce({ latest_invoice: null });
    const { refundLatestPayment } = await import("../src/admin");

    expect(await refundLatestPayment("sub_1")).toEqual({
      ok: false,
      reason: "no_subscription",
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @repo/payments test -- admin-stripe`
Expected: PASS. (The mock replaces `../src/client`; `admin.ts` reads its `getStripe`/`isStripeConfigured` from the mock. `@repo/db` still constructs under the setup default db url but is unused here.)

- [ ] **Step 3: Type-check** (the whole package, both test files)

Run: `pnpm --filter @repo/payments check-types`
Expected: PASS. If the `vi.mock` factory's return type is rejected, cast it: `getStripe: () => (… as unknown as import("../src/client").Stripe)`.

- [ ] **Step 4: Commit**

```bash
git add packages/payments/test/admin-stripe.test.ts
git commit -m "test(payments): mocked-Stripe coverage for refund/extend call shapes"
```

---

## Task 4: Admin billing Server Actions

**Files:** `apps/admin/lib/billing-actions.ts` (create)

- [ ] **Step 1: Create `apps/admin/lib/billing-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@repo/db";
import {
  extendSubscription,
  getSubscription,
  grantProComp,
  refundLatestPayment,
  revokeProComp,
} from "@repo/payments";
import { logger } from "@repo/observability/logger";

import { requireAdmin } from "./admin-actions";

/**
 * Admin billing remediation, per user. Each verifies `requireAdmin()`, calls a
 * keyless-graceful @repo/payments function, audits the result (including a
 * `not_configured` keyless no-op, so the attempt is always visible), and
 * revalidates the user's detail page. No self-protection guard — billing is not
 * a security lockout (unlike role/ban/delete).
 */
async function audit(
  actorUserId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAuditLog({ actorUserId, action, targetType: "user", targetId, metadata });
  } catch (error) {
    logger.error("audit log write failed", { error, action, targetId });
  }
}

function readDays(formData: FormData, fallback: number): number {
  const n = Number(formData.get("days"));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function grantProAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const days = readDays(formData, 30);
  const result = await grantProComp(userId, days);
  await audit(actorId, "billing.comp.grant", userId, { days, result });
  revalidatePath(`/users/${userId}`);
}

export async function revokeProAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const result = await revokeProComp(userId);
  await audit(actorId, "billing.comp.revoke", userId, { result });
  revalidatePath(`/users/${userId}`);
}

export async function refundAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const sub = await getSubscription(userId);
  const result = await refundLatestPayment(sub?.stripeSubscriptionId ?? null);
  await audit(actorId, "billing.refund", userId, { result });
  revalidatePath(`/users/${userId}`);
}

export async function extendAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const days = readDays(formData, 7);
  const sub = await getSubscription(userId);
  const result = await extendSubscription(sub?.stripeSubscriptionId ?? null, days);
  await audit(actorId, "billing.extend", userId, { days, result });
  revalidatePath(`/users/${userId}`);
}
```

- [ ] **Step 2: Confirm `getSubscription` is exported from `@repo/payments`**

Run: `grep -n "getSubscription" packages/payments/src/index.ts`
Expected: a re-export line. If absent, add `export { getSubscription, isPro, type SubscriptionRecord } from "./subscription";` to the index.

- [ ] **Step 3: Type-check + lint**

Run: `pnpm --filter admin lint && BETTER_AUTH_SECRET="ci-placeholder-secret-please-change-0123456789ab" BETTER_AUTH_URL="http://localhost:3200" NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3200" DATABASE_URL="file:local.db" pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/lib/billing-actions.ts
git commit -m "feat(admin): billing Server Actions (refund/extend/comp) + audit"
```

---

## Task 5: `/users/[userId]` detail page

**Files:** `apps/admin/app/users/[userId]/page.tsx` (create)

- [ ] **Step 1: Create `apps/admin/app/users/[userId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, eq, user } from "@repo/db";
import { getSubscription, isStripeConfigured } from "@repo/payments";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";

import { requireAdmin } from "../../../lib/admin-actions";
import {
  extendAction,
  grantProAction,
  refundAction,
  revokeProAction,
} from "../../../lib/billing-actions";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;

  const [target] = await db.select().from(user).where(eq(user.id, userId));
  if (!target) notFound();

  const sub = await getSubscription(userId);
  const stripeReady = isStripeConfigured();
  const stripeDisabled = !stripeReady || !sub?.stripeSubscriptionId;

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <nav className="mb-4 text-sm">
        <Link href="/users" className="underline">
          ← Users
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">{target.email}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Role: {target.role === "admin" ? "admin" : "user"}
      </p>

      <section className="mt-6">
        <h2 className="font-medium">Subscription</h2>
        <p className="text-sm" data-testid="sub-summary">
          {sub
            ? `${sub.plan ?? "?"} · ${sub.status ?? "?"}`
            : "No subscription (free)"}
        </p>
      </section>

      <section className="mt-6 grid max-w-md gap-4">
        <h2 className="font-medium">Billing actions</h2>

        <form action={grantProAction} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <label className="text-sm">
            Days
            <Input
              type="number"
              name="days"
              defaultValue={30}
              min={1}
              className="w-24"
              aria-label="Comp days"
            />
          </label>
          <Button type="submit">Grant Pro</Button>
        </form>

        <form action={revokeProAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="outline">
            Revoke Pro
          </Button>
        </form>

        <form action={refundAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="outline" disabled={stripeDisabled}>
            Refund last payment
          </Button>
          {stripeDisabled ? (
            <span className="text-muted-foreground ml-2 text-xs">
              Stripe not configured
            </span>
          ) : null}
        </form>

        <form action={extendAction} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <label className="text-sm">
            Days
            <Input
              type="number"
              name="days"
              defaultValue={7}
              min={1}
              className="w-24"
              aria-label="Extend days"
            />
          </label>
          <Button type="submit" variant="outline" disabled={stripeDisabled}>
            Extend
          </Button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Lint + type-check** (`db.select().from(user)` — user is NOT an owner table, no scope helper needed)

Run: `pnpm --filter admin lint && BETTER_AUTH_SECRET="ci-placeholder-secret-please-change-0123456789ab" BETTER_AUTH_URL="http://localhost:3200" NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3200" DATABASE_URL="file:local.db" pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/users/[userId]/page.tsx"
git commit -m "feat(admin): /users/[id] detail — subscription + billing controls"
```

---

## Task 6: "Manage" link on the user list

**Files:** `apps/admin/app/users/page.tsx` (modify)

- [ ] **Step 1: Add a Manage link to each row's Actions cell.** In the `<td className="flex flex-wrap gap-2 py-2">` of each row (after `<DeleteUserButton … />`), add:
```tsx
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/users/${u.id}`}>Manage</Link>
                  </Button>
```
The file already imports `Link` and `Button`.

- [ ] **Step 2: Lint + type-check**

Run: `pnpm --filter admin lint && BETTER_AUTH_SECRET="ci-placeholder-secret-please-change-0123456789ab" BETTER_AUTH_URL="http://localhost:3200" NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3200" DATABASE_URL="file:local.db" pnpm --filter admin check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/users/page.tsx"
git commit -m "feat(admin): Manage link from /users to the user detail page"
```

---

## Task 7: Admin billing e2e (keyless)

**Files:** `apps/admin/e2e/admin-billing.spec.ts` (create)

- [ ] **Step 1: Create `apps/admin/e2e/admin-billing.spec.ts`**

```ts
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
  await page.getByTestId(`user-row-${target}`).getByRole("link", { name: "Manage" }).click();
  await expect(page.getByRole("heading", { name: target })).toBeVisible();

  // Free to start; Stripe controls disabled (no key in e2e).
  await expect(page.getByTestId("sub-summary")).toHaveText("No subscription (free)");
  await expect(page.getByRole("button", { name: "Refund last payment" })).toBeDisabled();
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
  await expect(page.getByTestId("audit-row-billing.comp.grant").first()).toBeVisible();
  await expect(page.getByTestId("audit-row-billing.comp.revoke").first()).toBeVisible();
});
```

- [ ] **Step 2: Run the admin e2e (SP1 + SP2 + this)**

Run: `pnpm --filter admin test:e2e`
Expected: all pass (3 SP1 + 3 SP2 + 1 SP3).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/e2e/admin-billing.spec.ts
git commit -m "test(admin): e2e — Pro comp grant/revoke (keyless) + disabled Stripe controls + audit"
```

---

## Task 8: Full QA + finish

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: all PASS (payments now has admin.test + admin-stripe.test; db unchanged count).

- [ ] **Step 2: Build (excl. admin's pre-existing local-env failure)**

Run: `pnpm exec turbo run build --filter='!admin'`
Expected: PASS.

- [ ] **Step 3: Regression — web e2e (48)**

Run: `pnpm --filter web test:e2e`
Expected: 48 passed.

- [ ] **Step 4: Admin e2e (SP1 + SP2 + SP3 = 7)**

Run: `pnpm --filter admin test:e2e`
Expected: all pass.

- [ ] **Step 5: Finish the branch** — invoke `superpowers:finishing-a-development-branch`: push, open a PR, wait for CI (Node 22/24 + pg-compat + web e2e + admin e2e) green, then ff-merge to `main`. This completes the admin/RBAC roadmap (eval backlog #4).

---

## Self-Review

**Spec coverage:** §1 goals (refund/extend/comp + audit + keyless) → Tasks 2/3 (functions+tests), 4 (actions+audit). §2 components → Tasks 2/4/5/6. §3 functions + BillingResult → Task 2. §4 Server Actions (requireAdmin→fn→audit→revalidate, no self-guard) → Task 4. §5 UI (detail page, disabled rule on isStripeConfigured||no stripeSubscriptionId) → Task 5; Manage link → Task 6. §6 error handling (typed results, no throw) → Task 2/4. §7 testing (comp+keyless+mocked unit, keyless e2e) → Tasks 2/3/7/8. §8 file map → matches. No schema change (comp = data) — confirmed; pg-compat just stays green.

**Placeholder scan:** none — exact paths, full code, exact commands. The two "grep first, add if absent" steps (isStripeConfigured / getSubscription exports) include the concrete line to add.

**Type consistency:** `BillingResult` + the four function signatures (Task 2) are used identically in Task 4's actions and Task 3's tests. `grantProComp(userId, days)`, `revokeProComp(userId)`, `refundLatestPayment(stripeSubscriptionId|null)`, `extendSubscription(stripeSubscriptionId|null, days)` match across tasks. Audit action names `billing.comp.grant`/`billing.comp.revoke`/`billing.refund`/`billing.extend` match Task 4 ↔ Task 7 testids. `data-testid="sub-summary"` (Task 5) ↔ e2e (Task 7). `isNull` (Task 1) used by `revokeProComp` (Task 2).
