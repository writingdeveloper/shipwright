import {
  db,
  eq,
  ownedBy,
  processedStripeEvent,
  schema,
  subscription as subscriptionTable,
} from "@repo/db";
import { sendPaymentFailedEmail } from "@repo/email";
import { env } from "@repo/env";
import { logger } from "@repo/observability/logger";

import { getStripe, type Stripe } from "./client";

/**
 * @repo/payments — Stripe webhook verification + idempotent processing.
 *
 * Two responsibilities, deliberately split so the processing half is pure-ish
 * and unit-testable without a live Stripe:
 *
 *  1. {@link constructWebhookEvent} — verify the `Stripe-Signature` header
 *     against `STRIPE_WEBHOOK_SECRET` using the raw request body, returning the
 *     typed `Stripe.Event`. THROWS on a bad/forged signature or when the webhook
 *     is not configured — so the route can answer 400/503 and never trusts an
 *     unverified payload.
 *
 *  2. {@link handleWebhookEvent} — IDEMPOTENT processing. Stripe delivers each
 *     event at least once and RETRIES the same `event.id` on any non-2xx, so
 *     duplicates are normal. We dedupe by `event.id`: if it is already in
 *     `processed_stripe_event` we no-op; otherwise we apply the effect and
 *     record the id. Only a handful of event types matter
 *     (`checkout.session.completed`, `customer.subscription.updated/deleted`,
 *     `invoice.payment_failed`); everything else is acknowledged and ignored.
 */

/** Outcome of {@link handleWebhookEvent}, for logging/observability. */
export type HandleWebhookResult =
  /** The event id was already processed; nothing was done (the dedupe path). */
  | { readonly status: "duplicate"; readonly eventId: string }
  /** A relevant event was applied and recorded. */
  | { readonly status: "processed"; readonly eventId: string; readonly type: string }
  /** A valid but irrelevant event type — acknowledged and recorded, no effect. */
  | { readonly status: "ignored"; readonly eventId: string; readonly type: string };

/**
 * Verify a raw webhook payload and return the typed event.
 *
 * @param rawBody The EXACT raw request body string (`await req.text()`), never a
 *   re-serialised object — signature verification is byte-sensitive.
 * @param signature The `Stripe-Signature` request header.
 * @throws If the webhook secret is unset, the Stripe client is unconfigured, or
 *   the signature does not verify (forged/replayed/mangled payload).
 *
 * Uses `constructEventAsync`, the WebCrypto-based async variant, so verification
 * works under the Edge runtime as well as Node without a sync crypto polyfill.
 */
export async function constructWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<Stripe.Event> {
  const stripe = getStripe();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    // Caller maps this to a clean 503 ("not configured") — we do NOT fabricate
    // or trust an event without the means to verify it.
    throw new Error("Stripe webhook is not configured");
  }

  // Throws `Stripe.errors.StripeSignatureVerificationError` on a bad signature.
  return stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
}

/**
 * Has this Stripe event already been fully processed? The dedupe primitive
 * behind idempotency — a `true` here means a re-delivery should be a no-op.
 */
async function alreadyProcessed(eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: processedStripeEvent.id })
    .from(processedStripeEvent)
    .where(eq(processedStripeEvent.id, eventId))
    .limit(1);
  return Boolean(row);
}

/**
 * Record an event id as processed. `onConflictDoNothing` makes this safe under a
 * concurrent re-delivery race: whichever delivery inserts first wins, the other
 * is a no-op insert (and its earlier `alreadyProcessed` check would already have
 * short-circuited it in the common case).
 */
async function markProcessed(eventId: string, type: string): Promise<void> {
  await db
    .insert(processedStripeEvent)
    .values({ id: eventId, type })
    .onConflictDoNothing();
}

/**
 * Best-effort extraction of the current-period-end (unix-ms) from a Stripe
 * Subscription. Stripe moved `current_period_end` from the subscription onto its
 * items in newer API versions, so we read whichever is present and tolerate both
 * shapes without a hard dependency on one API version.
 */
function periodEndMs(sub: Stripe.Subscription): Date | null {
  const record = sub as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const seconds =
    record.current_period_end ?? record.items?.data?.[0]?.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

/** Resolve our user id from a Stripe object's metadata / client_reference_id. */
function userIdFrom(
  source: {
    metadata?: Stripe.Metadata | null;
    client_reference_id?: string | null;
  },
): string | null {
  return source.metadata?.userId ?? source.client_reference_id ?? null;
}

/**
 * Resolve our user id from an Invoice's subscription metadata (Checkout stamps
 * `userId` onto the subscription via `subscription_data.metadata`, and Stripe
 * copies it onto each invoice's subscription details). Like {@link periodEndMs},
 * tolerate both API shapes: `subscription_details` was top-level before the
 * 2025 API versions moved it under `parent`.
 */
function invoiceUserId(invoice: Stripe.Invoice): string | null {
  const record = invoice as unknown as {
    subscription_details?: { metadata?: { userId?: string } | null } | null;
    parent?: {
      subscription_details?: { metadata?: { userId?: string } | null } | null;
    } | null;
  };
  return (
    record.subscription_details?.metadata?.userId ??
    record.parent?.subscription_details?.metadata?.userId ??
    null
  );
}

/**
 * Notify a user their renewal charge failed, so they can fix the payment
 * method before dunning cancels the subscription. Best-effort: the address
 * comes from the invoice (falling back to our user row), the send no-ops
 * without Resend config, and no local subscription state is touched here —
 * `customer.subscription.updated` is the authoritative mirror of whatever
 * status Stripe transitions to, and handlers must not depend on event order.
 */
async function notifyPaymentFailed(
  userId: string,
  invoice: Stripe.Invoice,
): Promise<void> {
  let to = invoice.customer_email ?? null;
  if (!to) {
    const [row] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    to = row?.email ?? null;
  }
  if (!to) {
    logger.warn("[@repo/payments] payment_failed: no email for user", {
      userId,
    });
    return;
  }

  // BETTER_AUTH_URL is required in a real deployment; the localhost fallback
  // only exists for SKIP_ENV_VALIDATION contexts (unit tests) where it's unset.
  const appUrl =
    env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL ?? "http://localhost:3000";
  await sendPaymentFailedEmail({ to, billingUrl: `${appUrl}/dashboard` });
}

/**
 * Upsert a user's local subscription mirror from a Stripe Subscription object.
 * Owner-keyed on `userId` (the unique column), so repeated events for the same
 * user update the single row rather than inserting duplicates.
 */
async function upsertSubscription(
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const priceId = sub.items.data[0]?.price.id ?? null;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);

  const values = {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    priceId,
    // A subscription with an active/trialing status is our "pro" plan; anything
    // else is recorded as "free" so a downgrade/cancel flips the badge off.
    plan:
      sub.status === "active" || sub.status === "trialing" ? "pro" : "free",
    currentPeriodEnd: periodEndMs(sub),
  };

  await db
    .insert(subscriptionTable)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptionTable.userId,
      set: {
        stripeCustomerId: values.stripeCustomerId,
        stripeSubscriptionId: values.stripeSubscriptionId,
        status: values.status,
        priceId: values.priceId,
        plan: values.plan,
        currentPeriodEnd: values.currentPeriodEnd,
      },
    });
}

/** Mark a user's subscription as canceled (keep the row for history). */
async function markSubscriptionCanceled(
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  await db
    .update(subscriptionTable)
    .set({
      status: sub.status,
      plan: "free",
      currentPeriodEnd: periodEndMs(sub),
    })
    .where(ownedBy(subscriptionTable, userId));
}

/**
 * Apply a verified Stripe event to our local subscription state — IDEMPOTENTLY.
 *
 * Flow:
 *  1. If `event.id` is already in `processed_stripe_event`, return `duplicate`
 *     and do nothing (this is the retry/at-least-once safety net).
 *  2. Otherwise apply the effect for the handful of event types we care about
 *     (others are ignored), then record `event.id` so a later re-delivery is a
 *     no-op.
 *
 * Pure-ish: it touches only the DB and the passed event (no Stripe network
 * call), so it is unit-testable against a real libSQL temp database. It also
 * never throws for an unknown type — it records and ignores it.
 */
export async function handleWebhookEvent(
  event: Stripe.Event,
): Promise<HandleWebhookResult> {
  // (1) Idempotency gate: a re-delivered event id is a no-op.
  if (await alreadyProcessed(event.id)) {
    logger.info("[@repo/payments] duplicate webhook event ignored", {
      eventId: event.id,
      type: event.type,
    });
    return { status: "duplicate", eventId: event.id };
  }

  // (2) Apply the effect for the relevant types only.
  let handled = false;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = userIdFrom(session);
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);

      if (userId && subId) {
        // Retrieve the full subscription so we persist status + price + period.
        // getStripe() is non-null here in practice (we only reach a verified
        // event when configured), but guard so a config edge can't throw.
        const stripe = getStripe();
        if (stripe) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription(userId, sub);
          handled = true;
        }
      } else {
        logger.warn(
          "[@repo/payments] checkout.session.completed missing userId/subscription",
          { eventId: event.id },
        );
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const userId = userIdFrom(sub);
      if (userId) {
        await upsertSubscription(userId, sub);
        handled = true;
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = userIdFrom(sub);
      if (userId) {
        await markSubscriptionCanceled(userId, sub);
        handled = true;
      }
      break;
    }

    case "invoice.payment_failed": {
      // A renewal charge bounced. Stripe retries per its dunning schedule and
      // emits `customer.subscription.updated` for any status transition (which
      // the case above mirrors) — our job here is the user-facing half: tell
      // the customer so they can fix the card before the subscription lapses.
      const invoice = event.data.object;
      const userId = invoiceUserId(invoice);
      if (userId) {
        await notifyPaymentFailed(userId, invoice);
        handled = true;
      } else {
        logger.warn(
          "[@repo/payments] invoice.payment_failed missing userId metadata",
          { eventId: event.id },
        );
      }
      break;
    }

    default:
      // Unrelated event type: acknowledge + record so Stripe stops retrying,
      // but make no state change.
      break;
  }

  // (3) Record the event id LAST, so a crash mid-processing leaves the id
  // unrecorded and Stripe's retry re-runs it (at-least-once, then deduped on
  // the run that finally succeeds).
  await markProcessed(event.id, event.type);

  if (handled) {
    logger.info("[@repo/payments] processed webhook event", {
      eventId: event.id,
      type: event.type,
    });
    return { status: "processed", eventId: event.id, type: event.type };
  }

  return { status: "ignored", eventId: event.id, type: event.type };
}
