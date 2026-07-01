import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// This config is an ES module ("type": "module"), so derive __dirname manually.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end test configuration.
 *
 * Everything here is isolated from local development:
 *
 * - DATABASE: a fresh libSQL file under the OS temp dir, created and migrated
 *   (`drizzle-kit push`) ONCE when this config loads — never the dev
 *   `local.db`. An OS temp path (not a Git Bash `/tmp` path) is required so the
 *   native libSQL driver can open it on Windows.
 * - PORT: 3100 (dev uses 3000), so an in-progress `pnpm dev` won't collide.
 * - SERVER: a real production build (`next build` + `next start`) for stability,
 *   managed entirely by Playwright's `webServer` (started before tests, torn
 *   down after).
 */

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const DB_DIR = path.resolve(__dirname, "..", "..");
const isCI = !!process.env.CI;

// Fresh, throwaway database for this run.
const tempDir = mkdtempSync(path.join(tmpdir(), "shipwright-e2e-"));
const dbPath = path.join(tempDir, "e2e.db");
const DATABASE_URL = `file:${dbPath.split(path.sep).join("/")}`;

// Apply the schema to the temp DB before the server boots. Runs in @repo/db so
// drizzle.config.ts + the schema resolve; non-interactive against an empty file.
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
  // Drive @repo/seo's metadataBase / sitemap / robots absolute URLs off the
  // test server's origin so the SEO e2e assertions check real, matching output.
  NEXT_PUBLIC_APP_URL: BASE_URL,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  // 3 retries on CI (2 locally would be pointless). The serial journeys each do
  // 1–2 Better Auth password hashes (scrypt is DELIBERATELY slow), so on an
  // occasionally-throttled shared 2-core runner a whole journey can spike ~15×
  // and blow the timeout. That's the real, recurring flake class — retries are
  // the actual defence (a runner is rarely throttled across all attempts); the
  // timeout below just needs enough headroom for a normal-slow runner.
  retries: isCI ? 3 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
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
