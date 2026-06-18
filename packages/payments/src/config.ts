import { env } from "@repo/env";

/**
 * @repo/payments/config — tiny, CLIENT-SAFE configuration helpers.
 *
 * This module reads ONLY the public, non-secret bits of the Stripe config (the
 * public price id) plus a boolean "is the public price configured" signal, so a
 * client component can decide whether to render the upgrade UI WITHOUT importing
 * the server-only Stripe client. It mirrors the pattern of
 * `@repo/observability/config` / `@repo/analytics/config`, which expose only the
 * non-secret surface needed by the proxy / client.
 *
 * NOTE: whether billing is fully configured ALSO requires the secret key, which
 * is server-only. The dashboard checks that on the server (see
 * `isBillingConfigured` in the main entry) and only renders the button when both
 * the secret key AND a price id exist. The public price id here is used to label
 * / link the client button after the server has already gated it.
 */

/**
 * The public Stripe Price id, if one is configured (`STRIPE_PRICE_ID` is the
 * server fallback; `NEXT_PUBLIC_STRIPE_PRICE_ID` is the browser-visible one).
 * `undefined` when no price is set, in which case the upgrade flow is disabled.
 */
export function publicPriceId(): string | undefined {
  return env.NEXT_PUBLIC_STRIPE_PRICE_ID ?? undefined;
}

/**
 * Whether a public price id is configured. This is the CLIENT-visible half of
 * the configuration check (the secret key is checked server-side); use it only
 * for client-side rendering decisions, never as the authority for starting a
 * real checkout.
 */
export function hasPublicPriceId(): boolean {
  return Boolean(env.NEXT_PUBLIC_STRIPE_PRICE_ID);
}
