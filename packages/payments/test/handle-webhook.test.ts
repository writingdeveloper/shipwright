import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareTestDatabase, type PreparedTestDb } from "./db-helper";
import type { Stripe } from "../src/client";

/**
 * Idempotency + subscription-state invariants for the webhook handler, against a
 * REAL libSQL database created fresh per run (see `prepareTestDatabase`).
 *
 * The core property: Stripe delivers each event AT LEAST once and retries the
 * SAME `event.id` on any non-2xx, so `handleWebhookEvent` MUST be exactly-once —
 * the first delivery applies the effect and records the id; every re-delivery of
 * that id is a no-op (`duplicate`) leaving the DB untouched.
 *
 * `customer.subscription.*` events are pure DB writes (no Stripe network call),
 * so they exercise the full upsert/cancel + dedupe path without a live Stripe.
 * The graceful-degrade + signature paths live in `graceful-degrade.test.ts`.
 *
 * Order matters: prepare the temp DB (which sets DATABASE_URL) BEFORE importing
 * `@repo/db` / the payments handler, so the `@repo/db` singleton binds to it.
 */

let prepared: PreparedTestDb;
// Loaded dynamically after the temp DB is wired up.
let handleWebhookEvent: typeof import("../src/webhook").handleWebhookEvent;
let getSubscription: typeof import("../src/subscription").getSubscription;
let isPro: typeof import("../src/subscription").isPro;
let dbMod: typeof import("@repo/db");

const USER_ID = "user-sub-1";
const SUB_ID = "sub_test_123";
const CUSTOMER_ID = "cus_test_123";
const PRICE_ID = "price_test_pro";

/** A minimal `customer.subscription.updated/deleted` event for our handler. */
function subscriptionEvent(
  id: string,
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  status: Stripe.Subscription.Status,
): Stripe.Event {
  const sub = {
    id: SUB_ID,
    object: "subscription",
    customer: CUSTOMER_ID,
    status,
    metadata: { userId: USER_ID },
    current_period_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    items: {
      object: "list",
      data: [{ price: { id: PRICE_ID } }],
    },
  };

  // The handler only reads a small, stable subset of the Subscription/Event
  // shape, so a focused fixture cast to the SDK types is sufficient and avoids
  // pinning the test to every field of a specific API version.
  return {
    id,
    object: "event",
    type,
    data: { object: sub as unknown as Stripe.Subscription },
  } as unknown as Stripe.Event;
}

beforeAll(async () => {
  prepared = prepareTestDatabase();

  // Import AFTER DATABASE_URL is set so the @repo/db singleton uses the temp DB.
  dbMod = await import("@repo/db");
  ({ handleWebhookEvent } = await import("../src/webhook"));
  ({ getSubscription, isPro } = await import("../src/subscription"));

  // Seed the owning user (FK target for the subscription row).
  await dbMod.db.insert(dbMod.schema.user).values({
    id: USER_ID,
    email: "sub@example.com",
    name: "Sub User",
  });
}, 60_000);

afterAll(() => {
  prepared?.cleanup();
});

/** Count rows in the idempotency ledger for a given event id. */
async function processedCount(eventId: string): Promise<number> {
  const rows = await dbMod.db
    .select()
    .from(dbMod.schema.processedStripeEvent)
    .where(dbMod.eq(dbMod.schema.processedStripeEvent.id, eventId));
  return rows.length;
}

describe("handleWebhookEvent idempotency (real libSQL)", () => {
  it("processes a new event once and sets the user's subscription to Pro", async () => {
    const event = subscriptionEvent(
      "evt_update_1",
      "customer.subscription.updated",
      "active",
    );

    const first = await handleWebhookEvent(event);
    expect(first).toEqual({
      status: "processed",
      eventId: "evt_update_1",
      type: "customer.subscription.updated",
    });

    // Subscription mirror reflects the active/pro state.
    const sub = await getSubscription(USER_ID);
    expect(sub?.status).toBe("active");
    expect(sub?.plan).toBe("pro");
    expect(sub?.priceId).toBe(PRICE_ID);
    expect(sub?.stripeSubscriptionId).toBe(SUB_ID);
    expect(sub?.stripeCustomerId).toBe(CUSTOMER_ID);
    expect(await isPro(USER_ID)).toBe(true);

    // Exactly one ledger row for this event id.
    expect(await processedCount("evt_update_1")).toBe(1);
  });

  it("is a NO-OP on a re-delivery of the same event id (exactly-once)", async () => {
    const event = subscriptionEvent(
      "evt_update_1", // same id as above → must dedupe
      "customer.subscription.updated",
      "active",
    );

    const second = await handleWebhookEvent(event);
    expect(second).toEqual({ status: "duplicate", eventId: "evt_update_1" });

    // Still exactly one ledger row — the duplicate did not insert again.
    expect(await processedCount("evt_update_1")).toBe(1);

    // And still exactly one subscription row for the user (no dup inserts).
    const rows = await dbMod.db
      .select()
      .from(dbMod.schema.subscription)
      .where(dbMod.ownedBy(dbMod.schema.subscription, USER_ID));
    expect(rows.length).toBe(1);
  });

  it("ignores an unrelated event type but still records it (so Stripe stops retrying)", async () => {
    // A type the handler doesn't act on; cast a minimal fixture.
    const event = {
      id: "evt_unrelated_1",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as unknown as Stripe.Event;

    const result = await handleWebhookEvent(event);
    expect(result).toEqual({
      status: "ignored",
      eventId: "evt_unrelated_1",
      type: "payment_intent.succeeded",
    });
    expect(await processedCount("evt_unrelated_1")).toBe(1);

    // A re-delivery of the ignored event is still a no-op duplicate.
    const again = await handleWebhookEvent(event);
    expect(again.status).toBe("duplicate");
  });

  it("flips the user off Pro on customer.subscription.deleted", async () => {
    const event = subscriptionEvent(
      "evt_delete_1",
      "customer.subscription.deleted",
      "canceled",
    );

    const result = await handleWebhookEvent(event);
    expect(result.status).toBe("processed");

    const sub = await getSubscription(USER_ID);
    expect(sub?.status).toBe("canceled");
    expect(sub?.plan).toBe("free");
    expect(await isPro(USER_ID)).toBe(false);
  });
});

/**
 * A minimal `invoice.payment_failed` event. `userId` metadata rides on the
 * invoice's subscription details — under `parent` (2025+ API shapes) or
 * top-level (`legacyShape`), both of which the handler must tolerate.
 */
function invoiceFailedEvent(
  id: string,
  opts: { userId?: string | null; legacyShape?: boolean } = {},
): Stripe.Event {
  const metadata =
    opts.userId === null ? {} : { userId: opts.userId ?? USER_ID };
  const invoice = {
    id: "in_test_1",
    object: "invoice",
    customer: CUSTOMER_ID,
    // Email unconfigured in tests ⇒ the notify is a skipped no-op; the address
    // just proves the invoice-first lookup path doesn't hit the DB.
    customer_email: "sub@example.com",
    ...(opts.legacyShape
      ? { subscription_details: { metadata } }
      : { parent: { subscription_details: { metadata } } }),
  };
  return {
    id,
    object: "event",
    type: "invoice.payment_failed",
    data: { object: invoice as unknown as Stripe.Invoice },
  } as unknown as Stripe.Event;
}

describe("invoice.payment_failed (real libSQL, email unconfigured ⇒ skipped send)", () => {
  it("processes the event WITHOUT touching local subscription state", async () => {
    const before = await getSubscription(USER_ID);

    const result = await handleWebhookEvent(invoiceFailedEvent("evt_payfail_1"));
    expect(result).toEqual({
      status: "processed",
      eventId: "evt_payfail_1",
      type: "invoice.payment_failed",
    });

    // Notification-only: `customer.subscription.updated` owns the state mirror
    // (handlers must not depend on event order), so the row is UNCHANGED.
    const after = await getSubscription(USER_ID);
    expect(after).toEqual(before);
    expect(await processedCount("evt_payfail_1")).toBe(1);
  });

  it("is a NO-OP duplicate on re-delivery", async () => {
    const again = await handleWebhookEvent(invoiceFailedEvent("evt_payfail_1"));
    expect(again).toEqual({ status: "duplicate", eventId: "evt_payfail_1" });
    expect(await processedCount("evt_payfail_1")).toBe(1);
  });

  it("tolerates the legacy top-level subscription_details shape", async () => {
    const result = await handleWebhookEvent(
      invoiceFailedEvent("evt_payfail_legacy", { legacyShape: true }),
    );
    expect(result.status).toBe("processed");
  });

  it("ignores (but records) an invoice with no userId metadata", async () => {
    const result = await handleWebhookEvent(
      invoiceFailedEvent("evt_payfail_anon", { userId: null }),
    );
    expect(result).toEqual({
      status: "ignored",
      eventId: "evt_payfail_anon",
      type: "invoice.payment_failed",
    });
    expect(await processedCount("evt_payfail_anon")).toBe(1);
  });
});
