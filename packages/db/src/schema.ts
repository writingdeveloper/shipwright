import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Better Auth core schema (SQLite / libSQL).
 *
 * Generated with `@better-auth/cli generate` against the `@repo/auth` server
 * config, so column names, modes (`timestamp_ms`) and defaults match what
 * Better Auth's Drizzle adapter expects at runtime. Regenerate if the auth
 * config gains plugins that add fields. Later phases add a `task` table here.
 */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/**
 * Application table: a user's to-do tasks (Phase 2).
 *
 * Each task is owned by exactly one `user`; the FK cascades so a deleted user's
 * tasks are removed with them. Server Actions must still scope every read/write
 * by `userId` (defence in depth — the DB cascade is not an authz boundary).
 */
export const task = sqliteTable(
  "task",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: integer("completed", { mode: "boolean" })
      .default(false)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("task_userId_idx").on(table.userId)],
);

/**
 * Stripe webhook idempotency ledger (owned by `@repo/payments`).
 *
 * Stripe delivers each event AT LEAST once and retries the same `event.id` on
 * any non-2xx response (or timeout), so duplicate deliveries are normal. The
 * webhook handler records every event it has fully processed here, keyed by the
 * Stripe `event.id` (the PK), and SKIPS any id it has already seen — making
 * processing exactly-once regardless of how many times Stripe re-delivers. This
 * is intentionally NOT user-scoped: it is an infrastructure dedupe log, not
 * owner data.
 */
export const processedStripeEvent = sqliteTable("processed_stripe_event", {
  // Stripe's event id (e.g. `evt_...`). PK so a re-delivery of the same event
  // is an INSERT conflict / "already processed" short-circuit.
  id: text("id").primaryKey(),
  // The Stripe event type (e.g. `checkout.session.completed`), kept for audit
  // / debugging which event a row corresponds to.
  type: text("type").notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

/**
 * A user's Stripe subscription state (owned by `@repo/payments`).
 *
 * One row per user (the `userId` FK is unique and cascades, so a deleted user's
 * subscription row is removed with them). The webhook handler upserts this from
 * `checkout.session.completed` and `customer.subscription.updated/deleted`; the
 * app reads it (owner-scoped, like `task`) to decide whether a user is "Pro".
 * The DB cascade is NOT an authz boundary — reads must still scope by `userId`.
 */
export const subscription = sqliteTable(
  "subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    // Stripe Customer / Subscription ids for reconciliation and the billing
    // portal. Nullable because a row may be created before Stripe assigns them.
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // Stripe subscription status (`active`, `trialing`, `canceled`, …). Drives
    // `isPro`. Nullable until the first webhook sets it.
    status: text("status"),
    // The price the user is subscribed to and a coarse plan label ("pro"/"free")
    // derived from it, so the UI can branch without re-deriving from the price.
    priceId: text("price_id"),
    plan: text("plan"),
    // End of the current paid period (unix-ms); after this Stripe renews or the
    // subscription lapses. Used to decide if access is still live.
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("subscription_userId_idx").on(table.userId)],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  tasks: many(task),
  subscription: one(subscription, {
    fields: [user.id],
    references: [subscription.userId],
  }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, {
    fields: [subscription.userId],
    references: [user.id],
  }),
}));

export const taskRelations = relations(task, ({ one }) => ({
  user: one(user, {
    fields: [task.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

/** Aggregate of all tables — passed to the Drizzle client and Better Auth adapter. */
export const schema = {
  user,
  session,
  account,
  verification,
  task,
  processedStripeEvent,
  subscription,
};
