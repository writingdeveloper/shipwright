import { and, eq, sql, type Column, type Table } from "drizzle-orm";

import { pushSubscription, subscription, task, uploadedFile } from "./schema";

/**
 * Owner-scoping vocabulary — the single place that knows how a row is tied to
 * its owner. Importing these (instead of hand-writing `and(eq(id), eq(userId))`)
 * makes the correct predicate the easy, named, type-checked path; the
 * `no-unscoped-owner-table` ESLint rule then requires one of them on every
 * owner-table query, and `owner-scope.test.ts` proves they isolate by owner.
 *
 * Dialect-agnostic: typed against drizzle-orm's core `Table`/`Column`, so the
 * same helpers serve the libSQL schema AND the Postgres mirror (`schema.pg.ts`).
 */

/** A table that carries a `userId` owner column. */
type OwnerTable = Table & { userId: Column };
/** …and an `id` primary key, for single-row operations. */
type OwnerRowTable = OwnerTable & { id: Column };

/**
 * The set of owner-scoped tables. The invariant test iterates this, so a new
 * owner table added here is automatically held to the cross-user invariant.
 * Non-owner tables (`user`/`session`/`account`/`verification` — Better Auth;
 * `processedStripeEvent` — an infra dedupe ledger) are deliberately absent.
 */
export const OWNER_TABLES = [
  task,
  uploadedFile,
  pushSubscription,
  subscription,
] as const;

/** WHERE predicate: rows owned by `userId`. Use for owner-scoped list reads. */
export function ownedBy<T extends OwnerTable>(table: T, userId: string) {
  return eq(table.userId, userId);
}

/** WHERE predicate: the single row `id`, but only when owned by `userId`. */
export function ownedRow<T extends OwnerRowTable>(
  table: T,
  userId: string,
  id: string,
) {
  return and(eq(table.id, id), eq(table.userId, userId));
}

/**
 * Sentinel predicate that INTENTIONALLY spans all owners — legitimate ONLY in a
 * future role-checked admin path. It is greppable and recognised by the lint
 * rule, so every deliberate cross-owner read is auditable in one search. The
 * role check itself is NOT implemented here; it arrives with the RBAC/admin
 * roadmap item. Until then its only consumer is the invariant test.
 */
export function acrossAllOwners() {
  return sql`1 = 1`;
}
