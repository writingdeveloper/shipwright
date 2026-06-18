import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL ?? "file:local.db";

/**
 * Configured Drizzle client backed by a local libSQL (SQLite) file.
 *
 * Reads `DATABASE_URL` (default `file:local.db`). This module is server-only by
 * nature: `@libsql/client` cannot run in the browser, so importing it pulls DB
 * access into server code only (see the repo's Data Access Layer rule).
 */
export const db = drizzle({
  connection: { url: DATABASE_URL },
  schema,
});

export type Database = typeof db;
