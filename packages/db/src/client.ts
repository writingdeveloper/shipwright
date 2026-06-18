import { env } from "@repo/env";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

/**
 * Configured Drizzle client backed by a local libSQL (SQLite) file.
 *
 * `DATABASE_URL` (and the optional Turso `DATABASE_AUTH_TOKEN`) come from the
 * validated `@repo/env` schema, which defaults `DATABASE_URL` to `file:local.db`
 * — so this module never reads `process.env` directly. It is server-only by
 * nature: `@libsql/client` cannot run in the browser, so importing it pulls DB
 * access into server code only (see the repo's Data Access Layer rule).
 */
export const db = drizzle({
  connection: { url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN },
  schema,
});

export type Database = typeof db;
