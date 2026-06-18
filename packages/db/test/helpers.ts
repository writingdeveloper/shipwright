import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "../src/schema";

/** Absolute path to the `@repo/db` package root (so `db:push` runs with the right CWD). */
const PACKAGE_ROOT = path.resolve(__dirname, "..");

/** A throwaway test database plus its Drizzle client and a cleanup hook. */
export interface TestDb {
  /** Drizzle client bound to the temp libSQL file, with the full schema. */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Underlying libSQL client (close it before deleting the file on Windows). */
  client: Client;
  /** `file:` URL of the temp database. */
  url: string;
  /** Close the connection and best-effort delete the temp directory. */
  cleanup: () => void;
}

/**
 * Create a REAL libSQL database at a fresh OS-temp path and apply the
 * `@repo/db` schema to it via `drizzle-kit push`.
 *
 * This never touches the dev database (`apps/web/local.db` / the package's own
 * `local.db`): the path is an isolated `mkdtemp` directory under the OS temp
 * root. We must use an OS temp path (not a Git Bash `/tmp` path) because the
 * native libSQL driver on Windows cannot open MSYS-style paths.
 *
 * `drizzle-kit push` against a brand-new empty file is non-interactive (there
 * is nothing to drop), so it runs unattended and produces the exact same
 * tables production gets.
 */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(path.join(tmpdir(), "shipwright-db-test-"));
  const dbPath = path.join(dir, "test.db");
  // libSQL wants a forward-slashed file: URL even on Windows.
  const url = `file:${dbPath.split(path.sep).join("/")}`;

  // Apply the schema with the same tool production uses. `shell: true` lets the
  // `pnpm` shim resolve on Windows; CWD is the db package so drizzle.config.ts
  // and the schema path resolve correctly.
  execFileSync(
    "pnpm",
    ["--filter", "@repo/db", "db:push"],
    {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "ignore",
      shell: true,
    },
  );

  const client = createClient({ url });
  const db = drizzle(client, { schema });

  const cleanup = () => {
    try {
      client.close();
    } catch {
      // already closed
    }
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      // Windows may briefly hold the file handle; the temp dir is outside the
      // repo and harmless to leave behind.
    }
  };

  return { db, client, url, cleanup };
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
