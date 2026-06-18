import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Spin up a REAL libSQL database at a fresh OS-temp path, apply the `@repo/db`
 * schema to it via `drizzle-kit push`, AND point `DATABASE_URL` at it so the
 * `@repo/db` singleton (which `@repo/payments` imports) binds to THIS database.
 *
 * `@repo/payments`'s webhook handler reads/writes through `@repo/db`'s exported
 * `db` singleton, which resolves `DATABASE_URL` at import time. So the contract
 * here is: call {@link prepareTestDatabase} FIRST, then DYNAMICALLY import the
 * payments modules — that order guarantees the singleton connects to the temp
 * file, never the dev `local.db`. Mirrors `packages/db/test/helpers.ts`.
 *
 * We use an OS temp path (not a Git Bash `/tmp` path) because the native libSQL
 * driver on Windows cannot open MSYS-style paths.
 */

/** Absolute path to the `@repo/db` package root, so `db:push` runs with the right CWD. */
const DB_PACKAGE_ROOT = path.resolve(__dirname, "..", "..", "db");

export interface PreparedTestDb {
  /** `file:` URL of the temp database (already set on `process.env.DATABASE_URL`). */
  url: string;
  /** Remove the temp directory. */
  cleanup: () => void;
}

/**
 * Create + migrate a throwaway DB and export its URL as `DATABASE_URL`. Call
 * BEFORE importing any module that pulls in `@repo/db`.
 */
export function prepareTestDatabase(): PreparedTestDb {
  const dir = mkdtempSync(path.join(tmpdir(), "shipwright-payments-test-"));
  const dbPath = path.join(dir, "test.db");
  // libSQL wants a forward-slashed file: URL even on Windows.
  const url = `file:${dbPath.split(path.sep).join("/")}`;

  // Apply the schema with the same tool production uses. `shell: true` lets the
  // `pnpm` shim resolve on Windows; CWD is the db package so drizzle.config.ts
  // and the schema path resolve correctly. Push to the temp DB via DATABASE_URL.
  execFileSync("pnpm", ["--filter", "@repo/db", "db:push"], {
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
    shell: true,
  });

  // Bind the @repo/db singleton (imported later) to this temp DB.
  process.env.DATABASE_URL = url;

  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      // Windows may briefly hold the file handle; the temp dir is outside the
      // repo and harmless to leave behind.
    }
  };

  return { url, cleanup };
}
