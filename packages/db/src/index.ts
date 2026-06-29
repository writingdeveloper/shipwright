export { db, type Database } from "./client";
export * from "./schema";

/**
 * Re-export the Drizzle query helpers consumers need, so app code depends on
 * `@repo/db` (the data-access boundary) rather than reaching into `drizzle-orm`
 * directly. Add to this list as new operators are needed.
 */
export { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

/**
 * Owner-scoping helpers + the owner-table registry. Prefer these over
 * hand-written `and(eq(id), eq(userId))`; the `no-unscoped-owner-table` lint
 * rule requires one of them on every owner-table query.
 */
export { OWNER_TABLES, ownedBy, ownedRow, acrossAllOwners } from "./owner-scope";
