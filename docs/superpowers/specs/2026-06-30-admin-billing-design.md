# Admin Billing — Refunds, Extensions, Pro Comp (SP3) — Design Spec

**Date:** 2026-06-30
**Status:** Approved (brainstorming → spec)
**Decomposition:** SP3 of 3 (final) for the admin/RBAC roadmap item (eval backlog #4). SP1
(RBAC foundation) and SP2 (user management + audit_log) are merged. SP3 completes the admin
with billing operations.

**Builds on:** `@repo/payments` owns the lazy Stripe client (`getStripe()`,
`isStripeConfigured()`), the `subscription` table mirror, and `getSubscription`/`isPro`. The
admin app has `requireAdmin`, `recordAuditLog`, a `/users` list, and a `/audit` view.

---

## 1. Goals / Non-goals

**Goals**
1. **Refund** a user's latest subscription payment (Stripe).
2. **Extend** a user's current period by N days (Stripe — free days).
3. **Grant / revoke a Pro "comp"** — a LOCAL subscription override (no Stripe), so an admin can
   give any user (free or paying) Pro access for N days.
4. Every billing action is `requireAdmin`-gated and **audited**.
5. **Keyless-graceful** (the @repo/payments invariant): with no Stripe key, refund/extend no-op
   cleanly (UI shows "not configured"); the local comp works regardless.

**Non-goals**
- New checkout / plan-change flows (SP3 is admin remediation, not self-serve billing).
- Partial/amount-specific refunds — SP3 refunds the latest payment in full (YAGNI; extend later).
- Reconciling a comp against a later real Stripe subscription beyond what the existing webhook
  already does (the webhook upserts the row, naturally overwriting a comp).

---

## 2. Architecture — components

| Location | Responsibility |
|----------|----------------|
| `@repo/payments/src/admin.ts` (new) | `refundLatestPayment` / `extendSubscription` (Stripe) + `grantProComp` / `revokeProComp` (local) |
| `@repo/payments` index | export the four functions |
| `apps/admin/lib/billing-actions.ts` (new) | Server Actions wrapping each, `requireAdmin` + audit |
| `apps/admin/app/users/[userId]/page.tsx` (new) | user detail: identity + subscription state + billing controls |
| `apps/admin/app/users/[userId]/*` (client bits) | small forms/inputs (days) — mostly native + `@repo/ui` Button/Input |
| `apps/admin/app/users/page.tsx` (modify) | add a "Manage" link per row → `/users/[id]` |

**Keyless-graceful contract:** `refundLatestPayment` / `extendSubscription` check
`isStripeConfigured()` (or `getStripe()` returning null) FIRST and return a typed
`{ ok: false, reason: "not_configured" }` without constructing a client or throwing — mirroring
`createCheckoutSession`. `grantProComp` / `revokeProComp` touch only the local `subscription`
row (no Stripe), so they always work.

---

## 3. `@repo/payments` functions (server-only)

```ts
export type BillingResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "no_subscription" | "stripe_error" };

/** Refund the latest payment on a user's Stripe subscription (full). No-op if Stripe
 *  is unconfigured or the user has no Stripe subscription. */
export async function refundLatestPayment(stripeSubscriptionId: string | null): Promise<BillingResult>;

/** Push a Stripe subscription's next billing date out by `days` (free extension) via
 *  `trial_end`, no proration. No-op if Stripe is unconfigured or no subscription id. */
export async function extendSubscription(
  stripeSubscriptionId: string | null,
  days: number,
): Promise<BillingResult>;

/** LOCAL comp: upsert the user's subscription row to active "comp" for `days`, making
 *  `isPro` true. No Stripe call. `stripeSubscriptionId` is left null (it's a manual comp). */
export async function grantProComp(userId: string, days: number): Promise<BillingResult>;

/** Revoke a LOCAL comp (only a row with no `stripeSubscriptionId`, to avoid desyncing a
 *  real Stripe subscription): set status "canceled". No-op if the row is a real Stripe sub. */
export async function revokeProComp(userId: string): Promise<BillingResult>;
```

- **Refund** (Stripe configured): retrieve the subscription with `latest_invoice.payment_intent`
  expanded; if a payment intent exists, `stripe.refunds.create({ payment_intent })`. Errors →
  `{ ok: false, reason: "stripe_error" }` (logged).
- **Extend**: retrieve the subscription, compute `trial_end = current_period_end + days*86400`,
  `stripe.subscriptions.update(id, { trial_end, proration_behavior: "none" })`.
- **grantProComp**: `db.insert(subscription).values({ userId, status: "active", plan: "comp",
  currentPeriodEnd: now + days }).onConflictDoUpdate({ target: userId, set: { status, plan,
  currentPeriodEnd, stripeSubscriptionId: null } })` — mirrors the webhook's upsert. `isPro`
  (checks status active/trialing + period not lapsed) then returns true.
- **revokeProComp**: `db.update(subscription).set({ status: "canceled" }).where(and(
  eq(userId), isNull(stripeSubscriptionId)))` — guarded so a real Stripe sub is untouched.

---

## 4. Server Actions (`apps/admin/lib/billing-actions.ts`)

Each: `await requireAdmin()` → call the `@repo/payments` function with form values →
`recordAuditLog({ actorUserId, action, targetType: "user", targetId: userId, metadata })` →
`revalidatePath("/users/" + userId)`. Actions + metadata:
- `grantProAction` → `grantProComp(userId, days)` → `billing.comp.grant` `{days}`.
- `revokeProAction` → `revokeProComp(userId)` → `billing.comp.revoke`.
- `refundAction` → `refundLatestPayment(subId)` → `billing.refund` `{result}`.
- `extendAction` → `extendSubscription(subId, days)` → `billing.extend` `{days, result}`.

No self-protection guard — billing is not a security lockout (an admin comping/refunding their
own account is harmless), unlike role/ban/delete. The audit records the result (incl. a
keyless `not_configured` no-op) so the attempt is always visible.

---

## 5. UI — `/users/[userId]` detail

- `requireAdmin()`, then read the user (`db` → `user` table by id; not an owner table, no scope
  helper) + `getSubscription(userId)`.
- Show: email, role, ban status; subscription block — status / plan / current period end, or
  "No subscription (free)".
- Billing controls:
  - **Grant Pro**: a `days` number input (default 30) + submit → `grantProAction`.
  - **Revoke Pro**: submit → `revokeProAction` (shown when the row is a comp / active).
  - **Refund last payment**: submit → `refundAction`. Disabled with a "Stripe not configured"
    hint when `!isStripeConfigured()` (refund needs only the SECRET key, not a price — so gate on
    `isStripeConfigured`, NOT `isBillingConfigured`) or the user has no `stripeSubscriptionId`.
  - **Extend N days**: a `days` input + submit → `extendAction`. Same disabled rule.
- A back link to `/users`. `/users` rows gain a "Manage" link (next/link) to `/users/[id]`.

---

## 6. Error handling
- Keyless / no-subscription → the function returns `{ ok: false, reason }`; the action audits
  it and the page re-renders (no throw). The UI pre-disables Stripe controls when unconfigured.
- Stripe API failure → `{ ok: false, reason: "stripe_error" }`, logged via `@repo/observability`;
  surfaced as an inline message, never an unhandled throw.
- `requireAdmin` handles unauthorized (redirect/notFound) as in SP1/SP2.

---

## 7. Testing & QA
1. **`@repo/payments` unit tests** (extend the existing mocked-Stripe + test-db pattern):
   - `grantProComp` / `revokeProComp` against a test db — row becomes active "comp" / canceled;
     `isPro` flips true / false; revoke leaves a real-Stripe row (with a `stripeSubscriptionId`)
     untouched.
   - `refundLatestPayment` / `extendSubscription` with **Stripe unconfigured** → `not_configured`
     no-op (no client constructed); with a **mocked Stripe** → assert the right
     `refunds.create` / `subscriptions.update` call shape.
2. **Admin e2e (NEW `admin-billing.spec`)**, keyless: admin → `/users` → Manage a user →
   Grant Pro (30d) → subscription block shows active/"comp" → Revoke → shows free →
   `/audit` shows `billing.comp.grant` + `billing.comp.revoke`; the Refund/Extend controls are
   disabled ("Stripe not configured").
3. **Regression:** web e2e (48) + SP1/SP2 admin e2e (6) still green.
4. **Full gate** + pg-compat (no schema change in SP3, but keep it green), then ff-merge.

---

## 8. File-level change map
**Create**
- `packages/payments/src/admin.ts` — the four functions.
- `packages/payments/test/admin.test.ts` — unit tests.
- `apps/admin/lib/billing-actions.ts` — Server Actions.
- `apps/admin/app/users/[userId]/page.tsx` (+ any small client form component if needed).
- `apps/admin/e2e/admin-billing.spec.ts`.

**Modify**
- `packages/payments/src/index.ts` — export the four functions.
- `apps/admin/app/users/page.tsx` — "Manage" link per row.

**No schema change** — SP3 reuses the `subscription` table; the `plan: "comp"` value is data,
not a column. **No removals.**

---

## 9. Open risks / caveats
- **Comp ↔ Stripe desync:** a comp writes the local `subscription` row directly. If that user
  later starts a real Stripe subscription, the webhook upserts (overwrites) the row — correct.
  But a comp on a user who ALREADY has an active Stripe sub overwrites the mirror until the next
  webhook; documented as a known manual-override caveat. `revokeProComp` is guarded to only
  cancel rows without a `stripeSubscriptionId`, so it can never silently kill a paying sub.
- **Refund granularity:** SP3 refunds the latest payment in full only. Partial/by-amount is a
  future extension.
- **Stripe API shape** (`latest_invoice.payment_intent`, `trial_end`, `proration_behavior`) is
  pinned during planning against the installed `stripe` SDK version.
- **Keyless e2e** can prove the comp path + the disabled Stripe controls + audit, but NOT a real
  refund/extend — those are covered by the mocked-Stripe unit tests (the same split @repo/payments
  already uses for checkout/webhook).
