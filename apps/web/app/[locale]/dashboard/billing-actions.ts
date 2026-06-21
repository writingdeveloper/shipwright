"use server";

import { redirect } from "next/navigation";
import { logger } from "@repo/observability/logger";
import { createCheckoutSession } from "@repo/payments";

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

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const result = await createCheckoutSession({
    userId: session.user.id,
    customerEmail: session.user.email,
    successUrl: `${appUrl}/dashboard?checkout=success`,
    cancelUrl: `${appUrl}/dashboard?checkout=cancelled`,
  });

  if (!result.configured) {
    // Billing isn't set up — should be unreachable from the UI (button hidden),
    // but never throw: log and bounce back to the dashboard.
    logger.warn("startCheckout: billing not configured", {
      reason: result.reason,
    });
    redirect("/dashboard");
  }

  if ("error" in result) {
    // Stripe was configured but the API call failed; don't 500 the dashboard.
    logger.error("startCheckout: failed to create checkout session", {
      error: result.error,
    });
    redirect("/dashboard?checkout=error");
  }

  // Success: hand off to Stripe's hosted Checkout (top-level redirect, so no
  // Stripe.js and no CSP change).
  redirect(result.url);
}
