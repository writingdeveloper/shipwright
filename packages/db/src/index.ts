export { db, type Database } from "./client";
export * from "./schema";

/**
 * Re-export the Drizzle query helpers consumers need, so app code depends on
 * `@repo/db` (the data-access boundary) rather than reaching into `drizzle-orm`
 * directly. Add to this list as new operators are needed.
 */
export { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
