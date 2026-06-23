import { execFileSync } from "node:child_process";
import path from "node:path";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/schema.pg";

/** Absolute path to the `@repo/db` package root (so `db:push:pg` runs with the right CWD). */
const PACKAGE_ROOT = path.resolve(__dirname, "..");

/** A Postgres test database plus its Drizzle client and a cleanup hook. */
export interface TestDb {
  /** Drizzle client bound to the Postgres pool, with the full pg schema. */
  db: NodePgDatabase<typeof schema>;
  /** Underlying node-postgres pool (end it in afterAll). */
  pool: Pool;
  /** `postgresql://` URL the suite connected to. */
  url: string;
  /** Close the pool. */
  cleanup: () => Promise<void>;
}

/**
 * Connect to the Postgres at `DATABASE_URL`, apply the `@repo/db` pg schema via
 * `drizzle-kit push`, and hand back a clean Drizzle client.
 *
 * Unlike the libSQL helper (which mints a throwaway temp file per call), this
 * targets a SHARED database — the `pg-compat` CI workflow provides one via a
 * service container. `drizzle-kit push` against it is non-interactive (empty DB
 * ⇒ pure creates, no drops to confirm), and a `TRUNCATE … CASCADE` afterwards
 * guarantees a clean slate so a re-run against a persistent local Postgres does
 * not trip the unique-email seed.
 */
export async function createTestDb(): Promise<TestDb> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must point at a Postgres instance for the pg test suite " +
        "(the pg-compat CI workflow sets it via a service container).",
    );
  }

  // Apply the schema with the same tool production uses. `shell: true` lets the
  // `pnpm` shim resolve on Windows; CWD is the db package so drizzle.config.pg.ts
  // and the pg schema path resolve correctly.
  execFileSync("pnpm", ["--filter", "@repo/db", "db:push:pg"], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
    shell: true,
  });

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  // Clean slate. TRUNCATE "user" CASCADE clears every FK-referencing app/auth
  // table (session, account, task, uploaded_file, …) with it.
  await pool.query('TRUNCATE TABLE "user" CASCADE');

  const cleanup = async () => {
    try {
      await pool.end();
    } catch {
      // already ended
    }
  };

  return { db, pool, url, cleanup };
}

/**
 * Insert a user row directly (bypassing Better Auth) so data-layer tests have
 * distinct owners without standing up the auth stack. Returns the user id.
 */
export async function seedUser(
  { db }: Pick<TestDb, "db">,
  overrides: { id: string; email: string; name?: string },
): Promise<string> {
  await db.insert(schema.user).values({
    id: overrides.id,
    email: overrides.email,
    name: overrides.name ?? overrides.id,
  });
  return overrides.id;
}
