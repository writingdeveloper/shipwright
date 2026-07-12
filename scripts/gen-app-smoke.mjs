/**
 * Scaffold smoke test: a generated PWA app must HYDRATE in production.
 *
 * `pnpm gen app --args <name> <port> true` scaffolds an app whose `proxy.ts` mints a
 * strict per-request CSP: `script-src 'self' 'nonce-<n>' 'strict-dynamic'`. If the
 * generated root layout does not opt into dynamic rendering (`await connection()`),
 * Next prerenders the page statically, its scripts ship WITHOUT the nonce, and
 * 'strict-dynamic' makes the browser refuse every one of them — the page is dead
 * HTML. `pnpm dev` hides this completely (dev renders dynamically); only a
 * production build reveals it. Hence this gate.
 *
 * What this deliberately does NOT assert: there is no browser here. This script
 * fetches the HTML with a plain `fetch()` and regex-matches `<script>` tags for a
 * `nonce="..."` attribute — no CSP-violation listener, no real hydration check (in
 * the "React attached its event handlers" sense). The nonce assertion is the
 * load-bearing one for the defect this gate guards: 'strict-dynamic' admits a
 * script if and only if it carries the per-request nonce, so "every script tag has
 * the nonce" and "the browser will not refuse any script" are the same fact. A
 * missing nonce on even one script means the page is dead HTML regardless of what a
 * real browser's hydration lifecycle would otherwise do, so a browser adds
 * confidence but cannot change the verdict this regex already computes correctly.
 * Adding one (e.g. via Playwright) is YAGNI for the specific regression this gate
 * was written to catch — do not add one here.
 *
 * Usage: the app must already be generated and built. See the `scaffold-smoke` CI job.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const APP = process.env.SMOKE_APP ?? "csp-smoke";
const PORT = Number(process.env.SMOKE_PORT ?? 3400);

// `detached: true` makes `server` the leader of its own process group (POSIX) /
// process group (Windows). `pnpm --filter <app> start` itself spawns `next start`
// (a `next-server` grandchild) — signaling only the `pnpm` wrapper leaves that
// grandchild running, which keeps this step's stdout open until the CI job's
// `timeout-minutes` on every OS, not just Linux. killServer() below reaches the
// whole tree instead of just the immediate child.
const server = spawn("pnpm", ["--filter", APP, "start"], {
  stdio: ["ignore", "inherit", "inherit"],
  shell: process.platform === "win32",
  detached: true,
});

/** Kill the whole process tree `server` heads, not just the `pnpm` wrapper. */
function killServer() {
  if (server.pid === undefined) return;
  if (process.platform === "win32") {
    // Windows has no POSIX process groups, so a negative pid means nothing here;
    // `taskkill /T` kills the process tree instead (pnpm -> node -> next-server).
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  } else {
    // A negative pid signals the whole group `detached: true` created above,
    // reaching `next-server` (pnpm's grandchild) instead of just `pnpm` itself.
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already exited
    }
  }
}

const fail = (message) => {
  console.error(`\n✗ ${message}`);
  killServer();
  process.exit(1);
};

let html = "";
for (let attempt = 0; attempt < 60 && !html; attempt++) {
  await sleep(1000);
  try {
    const response = await fetch(`http://localhost:${PORT}/`);
    if (response.ok) html = await response.text();
  } catch {
    // not listening yet
  }
}

if (!html) fail(`the generated app never answered on :${PORT}`);

const scripts = html.match(/<script\b[^>]*>/g) ?? [];
const unnonced = scripts.filter((tag) => !/\snonce="/.test(tag));

console.log(`scripts: ${scripts.length} · without a nonce: ${unnonced.length}`);

if (scripts.length === 0) {
  fail("the page rendered no <script> tags at all — it did not render.");
}

if (unnonced.length > 0) {
  console.error(unnonced.slice(0, 5).join("\n"));
  fail(
    `${unnonced.length}/${scripts.length} scripts carry no CSP nonce. The generated ` +
      `app's root layout must call \`await connection()\`; otherwise its own nonce ` +
      `CSP ('strict-dynamic') blocks every script and the page never hydrates.`,
  );
}

console.log(
  "✓ every script carries the per-request nonce — the page can hydrate.",
);
killServer();
process.exit(0);
