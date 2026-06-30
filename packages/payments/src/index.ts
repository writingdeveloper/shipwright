/**
 * @repo/payments — Stripe subscription billing.
 *
 * Concerns, also importable via the `./config` subpath:
 * - `@repo/payments/config` → CLIENT-SAFE config helpers (`publicPriceId`,
 *   `hasPublicPriceId`) that read only the non-secret public price id, so a
 *   client component can decide whether to show the upgrade UI WITHOUT importing
 *   the server-only Stripe client.
 * - `@repo/payments` (this entry) → the SERVER-SIDE surface:
 *   - `createCheckoutSession(...)` — start a hosted Checkout (redirect flow, so
 *     no Stripe.js script and no CSP changes); carries `userId` for webhook
 *     attribution.
 *   - `constructWebhookEvent(rawBody, signature)` — verify the signature and
 *     return the typed event (throws on a bad signature / when unconfigured).
 *   - `handleWebhookEvent(event)` — IDEMPOTENT processing (dedupe by `event.id`,
 *     handle `checkout.session.completed` + `customer.subscription.updated/
 *     deleted`, ignore the rest).
 *   - `getSubscription(userId)` / `isPro(userId)` — owner-scoped read helpers.
 *   - `isBillingConfigured()` — server-side "is billing fully set up" check
 *     (secret key AND a price id) used to gate the dashboard upgrade button.
 *
 * GRACEFUL DEGRADATION: every secret (`STRIPE_SECRET_KEY`,
 * `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` / `NEXT_PUBLIC_STRIPE_PRICE_ID`) is
 * read from `@repo/env` and OPTIONAL. With no secret key the Stripe client is
 * NEVER constructed: `createCheckoutSession` returns `{ configured: false }` and
 * the webhook helpers throw a clean "not configured" the route maps to 503 — so
 * the app, tests, and CI run with no Stripe account and the dashboard hides the
 * upgrade button instead of redirecting off-site.
 *
 * This entry is server-only by contract (it reads server secrets and the libSQL
 * client). Import it from server code (a Server Action / Route Handler); import
 * `@repo/payments/config` for client rendering decisions.
 */

export {
  getStripe,
  isStripeConfigured,
  isWebhookConfigured,
  configuredPriceId,
  type Stripe,
} from "./client";

export {
  createCheckoutSession,
  type CreateCheckoutSessionArgs,
  type CreateCheckoutSessionResult,
} from "./checkout";

export {
  constructWebhookEvent,
  handleWebhookEvent,
  type HandleWebhookResult,
} from "./webhook";

export {
  getSubscription,
  isPro,
  type SubscriptionRecord,
} from "./subscription";

export {
  refundLatestPayment,
  extendSubscription,
  grantProComp,
  revokeProComp,
  type BillingResult,
} from "./admin";

import { configuredPriceId, isStripeConfigured } from "./client";

/**
 * Whether billing is FULLY configured server-side: a secret key AND a price id
 * are both present. The dashboard renders the "Upgrade to Pro" button only when
 * this is true, so a keyless (or price-less) deployment shows the disabled
 * "Billing not configured" note and the e2e is never redirected off-site.
 */
export function isBillingConfigured(): boolean {
  return isStripeConfigured() && Boolean(configuredPriceId());
}
