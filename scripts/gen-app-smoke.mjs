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
 * Usage: the app must already be generated and built. See the `scaffold-smoke` CI job.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const APP = process.env.SMOKE_APP ?? "csp-smoke";
const PORT = Number(process.env.SMOKE_PORT ?? 3400);

const server = spawn("pnpm", ["--filter", APP, "start"], {
  stdio: ["ignore", "inherit", "inherit"],
  shell: process.platform === "win32",
});

const fail = (message) => {
  console.error(`\n✗ ${message}`);
  server.kill();
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
server.kill();
