import { env } from "@repo/env";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema.pg";

/**
 * Drizzle client for the POSTGRES swap path — the runtime sibling of
 * `./client.ts` (libSQL).
 *
 * NOTHING in the reference app imports this today; libSQL (`./client.ts`) is the
 * only wired runtime path. It exists as the documented swap target and is what a
 * project moving to Postgres re-points `@repo/db`'s `.` / `./client` export at.
 * `node-postgres` accepts a connection string directly, so `DATABASE_URL` (from
 * the validated `@repo/env` schema — already a plain string, so a
 * `postgresql://…` URL passes its `min(1)` check) is all it needs; the Turso
 * `DATABASE_AUTH_TOKEN` is libSQL-only and unused here. Server-only by nature
 * (`pg` cannot run in the browser).
 */
export const db = drizzle({ connection: env.DATABASE_URL, schema });

export type Database = typeof db;
