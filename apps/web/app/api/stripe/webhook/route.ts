import { after, type NextRequest } from "next/server";
import {
  constructWebhookEvent,
  handleWebhookEvent,
  isStripeConfigured,
  isWebhookConfigured,
} from "@repo/payments";
import { logger } from "@repo/observability/logger";

/**
 * Stripe webhook endpoint.
 *
 * Contract (Stripe's verified best practices):
 *  - Read the RAW body (`await req.text()`) — signature verification is
 *    byte-sensitive, so we must NOT let a framework parse/re-serialise it.
 *  - VERIFY the `Stripe-Signature` header before trusting anything
 *    (`constructWebhookEvent`); a bad signature ⇒ 400.
 *  - ACK FAST: return 2xx as soon as the event is verified, and run the
 *    (idempotent) processing in `after()` so a slow handler can't make Stripe
 *    time out and retry. Any handler error is caught and logged — never bubbled
 *    into a 500 — because a 5xx would make Stripe retry indefinitely (and the
 *    handler is idempotent, so the next delivery reconciles anyway).
 *  - GRACEFUL DEGRADE: with no `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
 *    (the keyless app/tests/CI) return a clean 503 "not configured" WITHOUT
 *    throwing and without constructing a Stripe client.
 *
 * This route lives under `/api/*`, which the `proxy.ts` matcher already excludes
 * from BOTH the nonce CSP and the `/api/auth/*` rate-limiter, so no proxy change
 * is needed — the raw body reaches us untouched.
 *
 * `nodejs` runtime: the idempotency + subscription writes go through `@repo/db`'s
 * libSQL client, which is server/Node-only.
 */
export const runtime = "nodejs";
// Never cache a webhook; every delivery must run.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  // Graceful degrade: not configured ⇒ clean 503, no client constructed.
  if (!isStripeConfigured() || !isWebhookConfigured()) {
    return Response.json(
      { error: "Stripe is not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json(
      { error: "Missing Stripe-Signature header" },
      { status: 400 },
    );
  }

  // RAW body — required for signature verification.
  const rawBody = await req.text();

  let event;
  try {
    event = await constructWebhookEvent(rawBody, signature);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    // A failed signature is the expected "forged/mangled payload" path — log at
    // warn and reject with 400 so Stripe does NOT retry an unverifiable body.
    logger.warn("[stripe/webhook] signature verification failed", {
      error: message,
    });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ACK FAST, process AFTER the response is sent. `handleWebhookEvent` is
  // idempotent (dedupes by event.id), so re-delivery is safe; we still catch so
  // a handler bug logs instead of crashing the deferred task.
  after(async () => {
    try {
      await handleWebhookEvent(event);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      logger.error("[stripe/webhook] handler error", {
        error: message,
        eventId: event.id,
        type: event.type,
      });
    }
  });

  return Response.json({ received: true }, { status: 200 });
}
