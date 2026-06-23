import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Better Auth + app schema — POSTGRES mirror of `./schema.ts`.
 *
 * This is the CI-tested target of the documented SQLite→Postgres swap. It is a
 * faithful pg-core port of `schema.ts` (sqlite-core): same tables, columns,
 * indexes, relations and aggregate — only the dialect mechanics differ:
 *   - `sqliteTable` → `pgTable`
 *   - `integer(_, { mode: "boolean" })` → `boolean(_)`
 *   - `integer(_, { mode: "timestamp_ms" })` + `unixepoch` default →
 *     `timestamp(_, { withTimezone: true })` + `.defaultNow()`
 *   - app-generated `text(...).$defaultFn(crypto.randomUUID)` PKs → native
 *     `uuid(...).defaultRandom()` (task / uploadedFile / pushSubscription /
 *     subscription)
 *   - Better-Auth-generated PKs (user / session / account / verification) and
 *     the Stripe event id stay `text(...)` — those ids are set upstream, not by
 *     the DB.
 *
 * NOTHING imports this at runtime in the reference app (libSQL is the only wired
 * path — see `./client.ts`); it exists so the `pg-compat` CI workflow can apply
 * it to a real Postgres and run the ownership invariants, so the documented swap
 * guide can never silently rot. Keep it in lockstep with any change to
 * `schema.ts`.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const account = pgTable(
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
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
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
export const task = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: boolean("completed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("task_userId_idx").on(table.userId)],
);

/**
 * Application table: a user's uploaded files (S3-compatible storage, @repo/storage).
 *
 * Owned by exactly one `user` (FK cascades, so a deleted user's files go with
 * them). The bytes live in the bucket; this row is the owner-scoped metadata plus
 * the object `key` (unique across the bucket). Server Actions scope every
 * read/write by `userId` — the cascade is NOT an authz boundary. Deleting a row
 * also deletes the object (see `apps/web` file-actions).
 */
export const uploadedFile = pgTable(
  "uploaded_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Object key in the bucket, namespaced by userId; unique across the bucket.
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("uploadedFile_userId_idx").on(table.userId)],
);

/**
 * Web Push subscriptions (owned by `@repo/pwa`).
 *
 * One row per browser push subscription, owned by a `user` (FK cascades, so a
 * deleted user's subscriptions go with them). `endpoint` is unique — re-subscribing
 * the same browser upserts the same row. The server sends to a user by loading
 * their rows (owner-scoped) and prunes rows the push service reports as gone
 * (404/410). The cascade is NOT an authz boundary — reads/writes scope by `userId`.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The push service endpoint URL (unique per browser subscription).
    endpoint: text("endpoint").notNull().unique(),
    // ECDH public key + auth secret from the browser's PushSubscription, needed
    // by web-push to encrypt the payload. Not secrets in the credential sense.
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("pushSubscription_userId_idx").on(table.userId)],
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
export const processedStripeEvent = pgTable("processed_stripe_event", {
  // Stripe's event id (e.g. `evt_...`). PK so a re-delivery of the same event
  // is an INSERT conflict / "already processed" short-circuit.
  id: text("id").primaryKey(),
  // The Stripe event type (e.g. `checkout.session.completed`), kept for audit
  // / debugging which event a row corresponds to.
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
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
export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    // End of the current paid period; after this Stripe renews or the
    // subscription lapses. Used to decide if access is still live.
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("subscription_userId_idx").on(table.userId)],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  tasks: many(task),
  uploadedFiles: many(uploadedFile),
  pushSubscriptions: many(pushSubscription),
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

export const uploadedFileRelations = relations(uploadedFile, ({ one }) => ({
  user: one(user, {
    fields: [uploadedFile.userId],
    references: [user.id],
  }),
}));

export const pushSubscriptionRelations = relations(
  pushSubscription,
  ({ one }) => ({
    user: one(user, {
      fields: [pushSubscription.userId],
      references: [user.id],
    }),
  }),
);

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
  uploadedFile,
  pushSubscription,
  processedStripeEvent,
  subscription,
};
