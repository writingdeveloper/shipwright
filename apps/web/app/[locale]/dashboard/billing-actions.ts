"use server";

import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { logger } from "@repo/observability/logger";
import { redirect } from "../../../i18n/navigation";
import {
  createBillingPortalSession,
  createCheckoutSession,
} from "@repo/payments";

import { allowAction } from "../../../lib/action-limits";
import { requireSession } from "../../../lib/auth-actions";
import { env } from "../../../env";

/**
 * Billing Server Action: start a Stripe hosted Checkout for the signed-in user.
 *
 * Auth is verified INSIDE the action (repo rule) — we never trust the page to
 * have gated it. The user's id + email are passed to `createCheckoutSession` so
 * the resulting subscription is attributed back to them by the webhook.
 *
 * GRACEFUL DEGRADE: if Stripe is not configured (or a Stripe call fails),
 * `createCheckoutSession` returns a `{ configured: false }` / `{ error }` result
 * WITHOUT throwing; we log and fall through to a redirect back to the dashboard
 * rather than 500ing. The button is already hidden server-side when billing is
 * unconfigured (see the dashboard), so this is a defence-in-depth no-op for the
 * keyless app/tests/CI — the e2e is never sent off-site.
 *
 * On success we `redirect()` to Stripe's hosted Checkout URL. `redirect` throws
 * a control-flow signal Next handles, so it is intentionally OUTSIDE the
 * try/catch (and reached only on the success path).
 */
export async function startCheckout(): Promise<void> {
  const session = await requireSession();

  // Each call creates a real Stripe session — rate-limit per user. A blocked
  // call bounces back to the dashboard (logged); 5/min never blocks a human.
  if (!(await allowAction("billing", session.user.id))) {
    redirect({ href: "/dashboard", locale: await getLocale() });
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const result = await createCheckoutSession({
    userId: session.user.id,
    customerEmail: session.user.email,
    successUrl: `${appUrl}/dashboard?checkout=success`,
    cancelUrl: `${appUrl}/dashboard?checkout=cancelled`,
  });

  const locale = await getLocale();

  if (!result.configured) {
    // Billing isn't set up — should be unreachable from the UI (button hidden),
    // but never throw: log and bounce back to the dashboard.
    logger.warn("startCheckout: billing not configured", {
      reason: result.reason,
    });
    redirect({ href: "/dashboard", locale });
  }

  if ("error" in result) {
    // Stripe was configured but the API call failed; don't 500 the dashboard.
    logger.error("startCheckout: failed to create checkout session", {
      error: result.error,
    });
    redirect({ href: "/dashboard?checkout=error", locale });
  }

  // After both guards above, result is `{ configured: true; url: string }`.
  // Success: hand off to Stripe's hosted Checkout (top-level redirect to an
  // external URL — use next/navigation directly since it's not an internal route).
  const configuredResult = result as { readonly configured: true; readonly url: string };
  nextRedirect(configuredResult.url);
}

/**
 * Billing Server Action: open Stripe's hosted Billing Portal (cancel, change
 * payment method, view invoices) for the signed-in user. Same contract as
 * {@link startCheckout}: auth verified inside, per-user rate limit, graceful
 * degrade to a dashboard redirect (`?billing=portal-error`) instead of a 500 —
 * the button is only rendered for a Pro with a Stripe customer, so the error
 * path is defence-in-depth for a stale page.
 */
export async function openBillingPortal(): Promise<void> {
  const session = await requireSession();

  if (!(await allowAction("billing", session.user.id))) {
    redirect({ href: "/dashboard", locale: await getLocale() });
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const result = await createBillingPortalSession({
    userId: session.user.id,
    returnUrl: `${appUrl}/dashboard`,
  });

  const locale = await getLocale();

  if (!result.configured) {
    logger.warn("openBillingPortal: billing not configured", {
      reason: result.reason,
    });
    redirect({ href: "/dashboard", locale });
  }

  if ("error" in result) {
    logger.error("openBillingPortal: failed to create portal session", {
      error: result.error,
    });
    redirect({ href: "/dashboard?billing=portal-error", locale });
  }

  const configured = result as { readonly configured: true; readonly url: string };
  nextRedirect(configured.url);
}
