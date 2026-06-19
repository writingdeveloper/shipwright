import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Spin up a REAL libSQL database at a fresh OS-temp path, apply the `@repo/db`
 * schema via `drizzle-kit push`, and point `DATABASE_URL` at it so the `@repo/db`
 * singleton binds to THIS database. Call BEFORE dynamically importing any module
 * that pulls in `@repo/db`. Mirrors `packages/payments/test/db-helper.ts`.
 *
 * An OS temp path (not a Git Bash `/tmp` path) is required — the native libSQL
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
  const dir = mkdtempSync(path.join(tmpdir(), "shipwright-pwa-test-"));
  const dbPath = path.join(dir, "test.db");
  const url = `file:${dbPath.split(path.sep).join("/")}`;

  execFileSync("pnpm", ["--filter", "@repo/db", "db:push"], {
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
    shell: true,
  });

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
