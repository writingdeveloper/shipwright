import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// This config is an ES module ("type": "module"), so derive __dirname manually.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Admin e2e — isolated from local dev, mirroring apps/web's config:
 *  - DATABASE: a fresh libSQL temp file, migrated (`drizzle-kit push`) once when
 *    this config loads. An OS temp path (not a Git Bash /tmp path) is required so
 *    the native libSQL driver can open it on Windows.
 *  - PORT: 3300 (web e2e uses 3100, admin dev 3200) so nothing collides.
 *  - SERVER: a real production build managed by Playwright's webServer.
 *  - ADMIN_EMAILS: `admin@example.com` so that sign-up promotes it to role
 *    "admin" via the @repo/auth create-hook — the bootstrap path under test.
 */
const PORT = 3300;
const BASE_URL = `http://localhost:${PORT}`;
const DB_DIR = path.resolve(__dirname, "..", "..");
const isCI = !!process.env.CI;

const tempDir = mkdtempSync(path.join(tmpdir(), "shipwright-admin-e2e-"));
const dbPath = path.join(tempDir, "e2e.db");
const DATABASE_URL = `file:${dbPath.split(path.sep).join("/")}`;

execFileSync("pnpm", ["--filter", "@repo/db", "db:push"], {
  cwd: DB_DIR,
  env: { ...process.env, DATABASE_URL },
  stdio: "inherit",
  shell: true,
});

const serverEnv = {
  ...process.env,
  DATABASE_URL,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "e2e-test-secret-please-change-in-real-deployments-0123456789",
  BETTER_AUTH_URL: BASE_URL,
  NEXT_PUBLIC_BETTER_AUTH_URL: BASE_URL,
  // The bootstrap allowlist: this email becomes role "admin" on sign-up.
  ADMIN_EMAILS: "admin@example.com",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  // Match apps/web: 3 CI retries + a generous timeout. The admin journeys sign
  // up + verify (Better Auth scrypt hashing is deliberately slow), which can
  // spike on a throttled shared runner — retries are the real defence.
  retries: isCI ? 3 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: BASE_URL,
    cwd: __dirname,
    env: serverEnv,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
