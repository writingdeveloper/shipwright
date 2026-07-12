# PR 1 — Stop the bleeding + drift gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six Blocker-class defects a new project hits on day 0, and land a
gate for each so it cannot silently return.

**Architecture:** Every task is `fix + gate`, and the gate is written **first** so it
goes red against the current code before the fix makes it green. Two new gate surfaces:
a fast static invariant suite (`scripts/repo-invariants.test.mjs`, run by
`pnpm test`) that catches manifest/version/template drift in milliseconds, and two slow
CI smoke jobs (`docker build`, `gen app` → production build → nonce assertion) that
prove the two paths CI has never exercised.

**Tech Stack:** Node 22 `node:test` (matching `scripts/rename.test.mjs`), Vitest
(package tests), GitHub Actions, Turborepo generators (plop), Handlebars templates.

## Global Constraints

- **Node floor is `>=22.13`** — `packageManager: pnpm@11.3.0` cannot install on less.
  This exact string goes in root `package.json` _and_ `packages/create-shipwright/package.json`.
- **Repo docs and code comments are English.** (Every existing `CLAUDE.md`, `README.md`,
  and spec is English; match it.)
- **Conventional commits**, one per task. Never `--no-verify`.
- **Prod CSP stays strict**: production `script-src`/`style-src` never gain
  `'unsafe-inline'`/`'unsafe-eval'`. Only `style-src-attr` may carry `'unsafe-inline'`.
- **A new gate must be proven to fail.** Before marking a task done, revert the fix
  (or break the input) and confirm the gate goes red. A gate that has only ever been
  green is not a verified gate.
- Full gate before PR: `pnpm lint && pnpm check-types && pnpm build && pnpm test && pnpm test:e2e`.

---

### Task 1: Repo-invariant gate — engines + template TypeScript drift

The published CLI advertises `node >=20`, but `pnpm@11.3.0` requires Node ≥22.13, so
`npx create-shipwright` clears the engines gate and then dies inside `pnpm install`.
CI already knows (`.github/workflows/ci.yml:17-19` excludes Node 20 _and states why_)
— nothing propagated that back to the manifests. Separately, the app generator pins
`typescript: 5.9.2` while the workspace is on `6.0.3`.

**Files:**

- Create: `scripts/repo-invariants.test.mjs`
- Modify: `package.json` (`engines.node`, add `test:invariants`, chain it into `test`)
- Modify: `packages/create-shipwright/package.json` (`engines.node`)
- Modify: `Dockerfile:15` (comment repeats the wrong floor)
- Modify: `turbo/generators/templates/app/package.json.hbs` (`typescript`)

**Interfaces:**

- Produces: `pnpm test:invariants` → `node --test scripts/repo-invariants.test.mjs`.
  Task 2 adds a Dockerfile-manifest test to this same file.

- [ ] **Step 1: Write the failing gate**

Create `scripts/repo-invariants.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Repo-wide invariants that no single package's test suite owns.
 *
 * These exist because the repo has repeatedly drifted in exactly these places:
 * a manifest, a template, or a workflow says one thing while the code says
 * another, and nothing fails. Each test below encodes a fact that must stay true,
 * with the failure mode spelled out in its assertion message.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(repoRoot, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

/**
 * The Node floor each pnpm major requires, per pnpm's own `engines`.
 * `packageManager` pins the pnpm version; advertising a Node floor BELOW what that
 * pnpm can run on is not cosmetic — `npx create-shipwright` passes the engines
 * check and then dies inside `pnpm install`. Add an entry when bumping pnpm major.
 */
const PNPM_NODE_FLOOR = { 11: ">=22.13" };

test("engines.node matches the Node floor the pinned pnpm requires", () => {
  const root = readJson("package.json");
  const major = Number(root.packageManager.match(/^pnpm@(\d+)\./)?.[1]);
  const expected = PNPM_NODE_FLOOR[major];
  assert.ok(
    expected,
    `pnpm ${major} has no recorded Node floor. Look up its \`engines.node\` on npm and add it to PNPM_NODE_FLOOR.`,
  );
  assert.equal(
    root.engines.node,
    expected,
    `package.json advertises node "${root.engines.node}" but pnpm ${major} needs "${expected}".`,
  );
});

test("the published CLI advertises the same engines as the repo", () => {
  const root = readJson("package.json");
  const cli = readJson("packages/create-shipwright/package.json");
  assert.equal(
    cli.engines.node,
    root.engines.node,
    "create-shipwright is published to npm — a wrong floor there is the first thing a new user hits.",
  );
});

test("every Node version in the CI matrix satisfies engines.node", () => {
  const floor = Number(
    readJson("package.json").engines.node.match(/(\d+)/)?.[1],
  );
  const matrix = read(".github/workflows/ci.yml").match(/node:\s*\[([^\]]+)\]/);
  assert.ok(matrix, "ci.yml must declare a `node: [...]` matrix");
  for (const raw of matrix[1].split(",")) {
    const version = Number(raw.trim());
    assert.ok(
      version >= floor,
      `CI runs Node ${version}, below the engines.node floor of ${floor}.`,
    );
  }
});

test("the app generator pins the same TypeScript as apps/web", () => {
  const web = readJson("apps/web/package.json");
  const template = read("turbo/generators/templates/app/package.json.hbs");
  const pinned = template.match(/"typescript":\s*"([^"]+)"/);
  assert.ok(pinned, "the app template must pin typescript");
  assert.equal(
    pinned[1],
    web.devDependencies.typescript,
    "a scaffolded app would type-check against a different compiler than the shared @repo/typescript-config targets.",
  );
});
```

- [ ] **Step 2: Wire the script and run it to watch it fail**

Add to root `package.json` `scripts` (keep alphabetical-ish placement next to `test:rename`):

```json
"test:invariants": "node --test scripts/repo-invariants.test.mjs",
```

And chain it into the aggregate test run — change:

```json
"test": "turbo run test && pnpm run test:rename",
```

to:

```json
"test": "turbo run test && pnpm run test:rename && pnpm run test:invariants",
```

Run: `pnpm test:invariants`

Expected: **FAIL — 3 of 4.** `engines.node` is `">=20"` (want `">=22.13"`), the CLI
echoes `">=20"`, and the template pins `5.9.2` (want `6.0.3`). The CI-matrix test
passes (22 and 24 both clear 22). This red is the proof the gate works.

- [ ] **Step 3: Fix root `package.json`**

`package.json:38-40` — replace:

```json
  "engines": {
    "node": ">=20"
  }
```

with:

```json
  "engines": {
    "node": ">=22.13"
  }
```

- [ ] **Step 4: Fix the CLI manifest**

`packages/create-shipwright/package.json:31-33` — replace `"node": ">=20"` with
`"node": ">=22.13"` in its `engines` block.

- [ ] **Step 5: Fix the template's TypeScript pin**

`turbo/generators/templates/app/package.json.hbs:30` — replace:

```json
    "typescript": "5.9.2"
```

with:

```json
    "typescript": "6.0.3"
```

- [ ] **Step 6: Fix the Dockerfile comment that repeats the wrong floor**

`Dockerfile:15` — replace:

```dockerfile
# Pinned to the repo's Node engine (>=20; we use 22) and pnpm (11.3.0).
```

with:

```dockerfile
# Pinned to the repo's Node engine (>=22.13, required by pnpm 11.3) and pnpm (11.3.0).
```

- [ ] **Step 7: Run the gate to verify it passes**

Run: `pnpm test:invariants`
Expected: **PASS — 4/4.**

- [ ] **Step 8: Prove the gate still bites**

Temporarily set root `engines.node` back to `">=20"`, run `pnpm test:invariants`,
confirm it goes **red** with the pnpm-floor message, then restore `">=22.13"` and
confirm green. (Do not commit the temporary edit.)

- [ ] **Step 9: Commit**

```bash
git add package.json packages/create-shipwright/package.json Dockerfile turbo/generators/templates/app/package.json.hbs scripts/repo-invariants.test.mjs
git commit -m "fix(engines,gen): declare the Node floor pnpm actually needs, and gate it

package.json advertised node >=20 while packageManager pins pnpm@11.3.0, which
requires Node >=22.13. CI already excluded Node 20 and its comment said why —
nothing propagated that to the manifests, including the one published to npm. So
\`npx create-shipwright\` cleared the engines gate and then died in pnpm install.

Also pins the app generator's TypeScript to the workspace's 6.0.3 (was 5.9.2), so
a scaffolded app no longer type-checks against a compiler the shared
@repo/typescript-config was not written for.

New: scripts/repo-invariants.test.mjs derives the required floor from the pinned
pnpm major, cross-checks the CLI manifest and the CI matrix against it, and pins
the generator's compiler to apps/web's. Verified to go red on each defect before
the fix."
```

---

### Task 2: Dockerfile workspace manifests + `docker build` smoke

`Dockerfile:31-46` copies 16 workspace manifests; the lockfile has 21. `apps/admin`
and `packages/{api,i18n,pwa,storage}` are missing, and `apps/web` hard-depends on the
last four (`apps/web/package.json:17,23,27,30`), so `pnpm install --frozen-lockfile`
cannot resolve the graph and the deps stage dies. It rotted for three weeks because
`.github/` contains **zero** occurrences of `docker` — CI has never built the image.
The Dockerfile's own comment at :27-28 states the rule it violates.

**Files:**

- Modify: `scripts/repo-invariants.test.mjs` (add the manifest test)
- Modify: `Dockerfile:31-46` (add the 5 missing `COPY` lines)
- Modify: `.github/workflows/ci.yml` (new `docker` job)

**Interfaces:**

- Consumes: `scripts/repo-invariants.test.mjs` from Task 1 (`repoRoot`, `read`, `readJson`).

- [ ] **Step 1: Write the failing gate**

Append to `scripts/repo-invariants.test.mjs` (and add `readdirSync`/`existsSync` to the
existing `node:fs` import at the top):

```js
/** Every workspace that pnpm must see to resolve the dependency graph. */
function workspaceManifests() {
  const found = [];
  for (const root of ["apps", "packages"]) {
    for (const name of readdirSync(join(repoRoot, root))) {
      const rel = `${root}/${name}/package.json`;
      if (existsSync(join(repoRoot, rel))) found.push(rel);
    }
  }
  return found.sort();
}

test("the Dockerfile's deps stage copies every workspace manifest", () => {
  const dockerfile = read("Dockerfile");
  const missing = workspaceManifests().filter(
    (rel) => !dockerfile.includes(`COPY ${rel} `),
  );
  assert.deepEqual(
    missing,
    [],
    `The deps stage is missing ${missing.length} workspace manifest(s). pnpm needs EVERY manifest to build the workspace graph, so \`pnpm install --frozen-lockfile\` fails outright without them — the image simply does not build.`,
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:invariants`
Expected: **FAIL** listing exactly `apps/admin/package.json`,
`packages/api/package.json`, `packages/i18n/package.json`, `packages/pwa/package.json`,
`packages/storage/package.json`.

- [ ] **Step 3: Fix the Dockerfile**

Replace `Dockerfile:31-46` (the whole `COPY …/package.json` block) with the complete,
alphabetically-ordered set of 21:

```dockerfile
COPY apps/admin/package.json ./apps/admin/
COPY apps/web/package.json ./apps/web/
COPY packages/analytics/package.json ./packages/analytics/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/create-shipwright/package.json ./packages/create-shipwright/
COPY packages/db/package.json ./packages/db/
COPY packages/email/package.json ./packages/email/
COPY packages/env/package.json ./packages/env/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/legal/package.json ./packages/legal/
COPY packages/observability/package.json ./packages/observability/
COPY packages/payments/package.json ./packages/payments/
COPY packages/pwa/package.json ./packages/pwa/
COPY packages/security/package.json ./packages/security/
COPY packages/seo/package.json ./packages/seo/
COPY packages/storage/package.json ./packages/storage/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
```

- [ ] **Step 4: Run the gate to verify it passes**

Run: `pnpm test:invariants`
Expected: **PASS — 5/5.**

- [ ] **Step 5: Add the slow gate — CI actually builds the image**

Append this job to `.github/workflows/ci.yml` (sibling of `verify`, at the same
indentation under `jobs:`):

```yaml
docker:
  name: Docker image builds
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - name: Checkout
      uses: actions/checkout@v7

    - name: Set up Buildx
      uses: docker/setup-buildx-action@v3

    # The static invariant test (scripts/repo-invariants.test.mjs) catches a
    # missing workspace manifest in milliseconds; this job is the proof that the
    # whole multi-stage build still works. Without it the Dockerfile rots
    # silently — it did, for three weeks, while packages landed around it.
    - name: Build the production image
      uses: docker/build-push-action@v6
      with:
        context: .
        push: false
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

- [ ] **Step 6: Verify the image builds locally**

Run: `docker build -t shipwright-web:pr1 .`
Expected: build succeeds through `deps`, `builder`, and `runner`. If Docker is not
available locally, push the branch and read the `docker` job's log in CI (`gh run view
--log`) — do not assume it passed from an exit code alone.

- [ ] **Step 7: Prove the gate bites**

Delete the `COPY packages/api/package.json ./packages/api/` line, run
`pnpm test:invariants` → confirm **red**; run `docker build .` → confirm it fails in
the `deps` stage with an unresolved `@repo/api` workspace dependency. Restore the line.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile scripts/repo-invariants.test.mjs .github/workflows/ci.yml
git commit -m "fix(docker): copy every workspace manifest, and build the image in CI

The deps stage copied 16 of the 21 workspace manifests — apps/admin and
packages/{api,i18n,pwa,storage} were missing. apps/web hard-depends on the last
four, so \`pnpm install --frozen-lockfile\` could not resolve the graph and the
image did not build at all. DEPLOY.md advertises Docker/Coolify/VPS as a
first-class path.

It rotted for three weeks because CI never built the image (\`docker\` appeared
zero times under .github/). Two gates now: a static invariant test that diffs the
COPY list against the real workspaces in milliseconds, and a CI job that actually
builds the image."
```

---

### Task 3: Generated apps must hydrate in production ★

`turbo/generators/templates/app/app/layout.tsx.hbs:10` declares a **sync**
`RootLayout`, so the page prerenders statically. But when the app is scaffolded as a
PWA, `templates/app/proxy.ts.hbs:13-25` mints a per-request nonce CSP with
`'strict-dynamic'`. A statically prerendered page carries **no nonce**, and
`'strict-dynamic'` makes the browser ignore `'self'` — so every script is refused and
the page ships as dead HTML that never hydrates. Measured on a generated app: 13
scripts, 13 blocked, hydration false. **Dev never shows this** (dev is always dynamic);
only the production build does.

Both real apps already carry the fix (`apps/web/app/[locale]/layout.tsx:88`,
`apps/admin/app/layout.tsx:29`, whose comment describes this exact failure). Only the
template drifted.

**Critical detail:** `connection()` must be added **only on the PWA branch**.
`proxy.ts`, `@repo/config`, and `securityHeaders` are all inside `{{#if pwa}}` guards
(`config.ts:130`, `next.config.ts.hbs:2-13`, `package.json.hbs:14-16`) — a non-PWA
generated app has **no CSP at all**, so forcing `connection()` there would destroy its
static rendering for nothing.

**Files:**

- Create: `scripts/gen-app-smoke.mjs`
- Modify: `turbo/generators/templates/app/app/layout.tsx.hbs`
- Modify: `.github/workflows/ci.yml` (new `scaffold-smoke` job)

**Interfaces:**

- Produces: `node scripts/gen-app-smoke.mjs` — starts the generated app on port 3400,
  fetches `/`, exits non-zero if any `<script>` lacks a `nonce` attribute.

- [ ] **Step 1: Write the failing gate**

Create `scripts/gen-app-smoke.mjs`:

```js
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
```

- [ ] **Step 2: Run it against the CURRENT (broken) template to verify it fails**

```bash
pnpm gen app --args csp-smoke 3400 true
pnpm install --no-frozen-lockfile
pnpm build --filter=csp-smoke
node scripts/gen-app-smoke.mjs
```

Expected: **FAIL** — `13/13 scripts carry no CSP nonce` (exact count may vary with the
Next version; any non-zero count is the failure). This is the bug, reproduced.

- [ ] **Step 3: Fix the template**

Replace the entire contents of `turbo/generators/templates/app/app/layout.tsx.hbs`:

```hbs
import type { Metadata } from "next";
{{#if pwa}}import { connection } from "next/server";
import { ServiceWorkerProvider } from "@repo/pwa/register";
{{/if}}import "./globals.css";

export const metadata: Metadata = {
  title: "{{ titleCase name }}",
  description: "{{ titleCase name }} — scaffolded with `pnpm gen app`.",
};

export default {{#if pwa}}async {{/if}}function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
{{#if pwa}}  // Opt into dynamic rendering so the per-request CSP nonce minted in `proxy.ts`
  // reaches Next's scripts. Without this the page prerenders statically, carries no
  // nonce, and the strict policy ('strict-dynamic' makes the browser ignore 'self')
  // blocks EVERY script — the page ships as dead HTML that never hydrates. `pnpm dev`
  // hides this; only the production build shows it.
  // See https://nextjs.org/docs/app/guides/content-security-policy.
  await connection();

{{/if}}  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
{{#if pwa}}        <ServiceWorkerProvider />
{{/if}}        {children}
      </body>
    </html>
  );
}
```

Note the non-PWA branch stays **sync** and static: without `proxy.ts` there is no CSP
to satisfy, and forcing dynamic rendering there would be a pure loss.

- [ ] **Step 4: Re-generate and verify the gate passes**

```bash
rm -rf apps/csp-smoke
pnpm gen app --args csp-smoke 3400 true
pnpm install --no-frozen-lockfile
pnpm build --filter=csp-smoke
node scripts/gen-app-smoke.mjs
```

Expected: **PASS** — `✓ every script carries the per-request nonce`.

- [ ] **Step 5: Verify the non-PWA app is still static**

```bash
pnpm gen app --args plain-smoke 3401
pnpm install --no-frozen-lockfile
pnpm build --filter=plain-smoke
```

Expected: the build output marks `/` as `○ (Static)`. A non-PWA app has no CSP, so it
must **keep** its static rendering — this confirms the fix did not over-apply.

- [ ] **Step 6: Clean up the scratch apps**

```bash
rm -rf apps/csp-smoke apps/plain-smoke
git checkout pnpm-lock.yaml
pnpm install --frozen-lockfile
git status --short   # must show no stray apps/ or lockfile changes
```

- [ ] **Step 7: Add the CI job**

Append to `.github/workflows/ci.yml` under `jobs:`:

```yaml
scaffold-smoke:
  name: Scaffold smoke — a generated PWA app hydrates under its own nonce CSP
  runs-on: ubuntu-latest
  timeout-minutes: 20
  env:
    SMOKE_APP: csp-smoke
    SMOKE_PORT: "3400"
  steps:
    - name: Checkout
      uses: actions/checkout@v7

    - name: Install pnpm
      uses: pnpm/action-setup@v6
      with:
        version: 11.3.0

    - name: Setup Node
      uses: actions/setup-node@v6
      with:
        node-version: 22
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    # `pnpm gen app` is the starter's headline feature. Nothing verified that what
    # it produces actually WORKS in production: a generated PWA app carries a nonce
    # CSP, and a root layout that does not `await connection()` prerenders without
    # the nonce, so 'strict-dynamic' blocks every script and the page never
    # hydrates. Dev looks perfect. This job is the only thing that sees it.
    - name: Scaffold a PWA app
      run: pnpm gen app --args csp-smoke 3400 true

    - name: Link the new workspace
      run: pnpm install --no-frozen-lockfile

    - name: Build it
      run: pnpm build --filter=csp-smoke

    - name: Assert every script carries the CSP nonce
      run: node scripts/gen-app-smoke.mjs
```

- [ ] **Step 8: Commit**

```bash
git add turbo/generators/templates/app/app/layout.tsx.hbs scripts/gen-app-smoke.mjs .github/workflows/ci.yml
git commit -m "fix(gen): generated PWA apps were dead HTML in production

The app generator's root layout was a sync function, so the page prerendered
statically. But a PWA-generated app's proxy.ts mints a strict nonce CSP with
'strict-dynamic' — a static page carries no nonce, 'strict-dynamic' makes the
browser ignore 'self', and every script is refused. Measured on a generated app:
13 scripts, 13 blocked, hydration never happened. \`pnpm dev\` hid it completely
(dev is always dynamic); only a production build showed it.

Both real apps already had the fix (apps/web and apps/admin both \`await
connection()\`, and admin's comment describes this exact failure). Only the
template drifted.

The fix is scoped to the PWA branch: a non-PWA generated app has no proxy.ts and
no CSP, so it keeps its static rendering.

New CI job scaffolds a PWA app, builds it for production, and asserts every
<script> carries the nonce. Verified to go red against the old template."
```

---

### Task 4: Warn when the rate limiter is in-memory in production

`packages/security/src/config.ts:33` defines `isDistributedRateLimitEnabled()` — the
exact detector for this hole — and **nothing calls it** (it is only re-exported). The
in-memory sliding window (`ratelimit.ts:68-130`) is per-instance, so on Vercel or any
autoscaler the effective limit is `limit × instances`, and the instance count **grows
with load** — a credential-stuffing burst scales the very ceiling meant to stop it.
Cold starts reset the window entirely. It governs auth brute-force
(`apps/web/proxy.ts:30-34`) and every per-user action limit
(`apps/web/lib/action-limits.ts:30-44`).

**Files:**

- Modify: `packages/security/src/ratelimit.ts`
- Modify: `packages/security/src/index.ts` (export the new symbols)
- Create: `packages/security/test/ratelimit-warning.test.ts`

**Interfaces:**

- Produces: `warnIfRateLimitNotDistributed(log?: (message: string) => void): void` and
  `resetRateLimitWarning(): void` (test seam), both exported from
  `@repo/security/ratelimit`. `createRateLimiter` calls the former on the in-memory path.

- [ ] **Step 1: Write the failing test**

Create `packages/security/test/ratelimit-warning.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimiter,
  resetRateLimitWarning,
  warnIfRateLimitNotDistributed,
} from "../src/ratelimit";

// The test setup sets SKIP_ENV_VALIDATION, so the Upstash vars are undefined and
// `isDistributedRateLimitEnabled()` is false — i.e. the in-memory path, which is
// exactly the case we must warn about in production.
describe("in-memory rate limiter warning", () => {
  beforeEach(() => {
    resetRateLimitWarning();
    vi.unstubAllEnvs();
  });

  it("warns in production when no distributed backend is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.fn();
    warnIfRateLimitNotDistributed(log);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).toContain("IN-MEMORY");
    expect(log.mock.calls[0]![0]).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("warns only once, no matter how many limiters are constructed", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.fn();
    warnIfRateLimitNotDistributed(log);
    warnIfRateLimitNotDistributed(log);
    warnIfRateLimitNotDistributed(log);
    expect(log).toHaveBeenCalledOnce();
  });

  it("stays silent outside production (dev, CI, tests use in-memory by design)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.fn();
    warnIfRateLimitNotDistributed(log);
    expect(log).not.toHaveBeenCalled();
  });

  it("createRateLimiter triggers the warning on the in-memory path", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createRateLimiter({ limit: 5, windowMs: 1000 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/security test`
Expected: **FAIL** — `resetRateLimitWarning` / `warnIfRateLimitNotDistributed` are not
exported from `../src/ratelimit`.

- [ ] **Step 3: Implement**

In `packages/security/src/ratelimit.ts`, change the import on line 1:

```ts
import { isDistributedRateLimitEnabled, upstashCredentials } from "./config";
```

Add, immediately above `createRateLimiter` (i.e. after the `UpstashRateLimiter` class):

```ts
/** Once-only guard so N limiters at module scope produce ONE warning, not N. */
let warnedNotDistributed = false;

/**
 * Warn ONCE, in production only, when the limiter falls back to the in-memory
 * backend.
 *
 * This is not a style nit. An in-memory sliding window is PER-INSTANCE, so on a
 * multi-instance host (Vercel, or any autoscaler) the effective limit is
 * `limit × instances` — and the instance count GROWS with load, so a credential-
 * stuffing burst scales the very ceiling meant to stop it. Cold starts reset the
 * window outright. `isDistributedRateLimitEnabled()` existed for precisely this
 * check and was never called.
 *
 * `log` is injectable so the unit test can assert without touching the console.
 */
export function warnIfRateLimitNotDistributed(
  log: (message: string) => void = console.warn,
): void {
  if (warnedNotDistributed) return;
  if (process.env.NODE_ENV !== "production") return;
  if (isDistributedRateLimitEnabled()) return;
  warnedNotDistributed = true;
  log(
    "[@repo/security] Rate limiting is using the IN-MEMORY backend in production. " +
      "That window is per-instance, so on a multi-instance host the real limit is " +
      "limit × instances, and cold starts reset it. Set UPSTASH_REDIS_REST_URL and " +
      "UPSTASH_REDIS_REST_TOKEN to share one window across instances.",
  );
}

/** Test seam: clear the once-only guard so each test starts fresh. */
export function resetRateLimitWarning(): void {
  warnedNotDistributed = false;
}
```

Then, in `createRateLimiter` (currently `ratelimit.ts:215-221`), call it on the
fallback path:

```ts
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const creds = upstashCredentials();
  if (creds) {
    return new UpstashRateLimiter(options, creds);
  }
  warnIfRateLimitNotDistributed();
  return new InMemoryRateLimiter(options);
}
```

- [ ] **Step 4: Export from the package index**

In `packages/security/src/index.ts`, add `warnIfRateLimitNotDistributed` to the symbols
re-exported from `./ratelimit`, alongside the existing exports. (Read the file first and
match its existing export style — do not export `resetRateLimitWarning`, which is a test
seam and stays reachable only via the `./ratelimit` subpath.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @repo/security test`
Expected: **PASS — 4 new tests green**, and the existing `ratelimit.test.ts` still green
(it runs under `NODE_ENV=test`, so the warning never fires and its output is unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/security/src/ratelimit.ts packages/security/src/index.ts packages/security/test/ratelimit-warning.test.ts
git commit -m "feat(security): warn when rate limiting is in-memory in production

isDistributedRateLimitEnabled() — the exact detector for this hole — was defined,
exported, and never called. The in-memory sliding window is per-instance, so on
Vercel or any autoscaler the effective limit is limit x instances, and the
instance count grows WITH load: a credential-stuffing burst scales the very
ceiling meant to stop it. Cold starts reset the window outright. It governs auth
brute-force protection and every per-user action limit.

Now createRateLimiter emits one warning (production only, once per process) on
the in-memory path, naming the two env vars that fix it."
```

---

### Task 5: `@repo/ui` hooks export + pin shadcn to Radix

Two independent footguns in the design system's entry points:

1. `packages/ui/components.json:19` declares a `hooks` alias (`@repo/ui/hooks`) that
   `packages/ui/package.json:6-10` does **not** export. `npx shadcn add sidebar` pulls
   `use-mobile` into that alias and the app then dies on `ERR_PACKAGE_PATH_NOT_EXPORTED`.
2. shadcn made **Base UI the default in July 2026**. `packages/ui/CLAUDE.md:5` prescribes
   a bare `npx shadcn@latest add <name> -c packages/ui`, which would now mix Base UI
   components into this Radix-based system — and `components.json` has no field to pin
   the primitive, so `-b radix` on the command line is the only defence.

**Files:**

- Modify: `packages/ui/package.json` (`exports`)
- Modify: `packages/ui/CLAUDE.md`
- Create: `packages/ui/test/exports.test.ts`
- Create: `packages/ui/vitest.config.ts`
- Modify: `packages/ui/package.json` (`test` script + vitest devDependency)

- [ ] **Step 1: Write the failing test**

Create `packages/ui/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/ui`.
 *
 * Scope is the package's CONTRACT, not its React components: the aliases declared in
 * components.json must actually resolve through package.json's `exports`, or a
 * `shadcn add` that uses one produces an app that cannot import it.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

Create `packages/ui/test/exports.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name: string) =>
  JSON.parse(readFileSync(join(packageRoot, name), "utf8"));

/**
 * The shadcn CLI rewrites imports to the aliases in components.json. If an alias has
 * no matching entry in package.json's `exports`, the generated component compiles in
 * isolation and then explodes at import time with ERR_PACKAGE_PATH_NOT_EXPORTED.
 * `shadcn add sidebar` hits exactly this: it pulls `use-mobile` into the hooks alias.
 */
describe("package contract", () => {
  it("exports every subpath that components.json aliases point at", () => {
    const components = readJson("components.json") as {
      aliases: Record<string, string>;
    };
    const exports = readJson("package.json") as {
      name: string;
      exports: Record<string, string>;
    };

    // "@repo/ui/components/ui" -> "./components/*"; "@repo/ui/lib/utils" -> "./lib/*".
    const exported = Object.keys(exports.exports);
    const resolves = (alias: string) => {
      const subpath = alias.slice(exports.name.length); // "" | "/components/ui" | …
      if (subpath === "") return exported.includes(".");
      const [, head] = subpath.split("/"); // "components" | "lib" | "hooks"
      return exported.some(
        (key) => key === `./${head}/*` || key === `.${subpath}`,
      );
    };

    const unresolvable = Object.entries(components.aliases)
      .filter(([, alias]) => alias.startsWith(exports.name))
      .filter(([, alias]) => !resolves(alias))
      .map(([key, alias]) => `${key} -> ${alias}`);

    expect(unresolvable).toEqual([]);
  });
});
```

- [ ] **Step 2: Wire the test script and run it to verify it fails**

In `packages/ui/package.json`, add `"test": "vitest run"` to `scripts` and
`"vitest": "^4.1.9"` to `devDependencies` (matching the version every other package
pins).

Run: `pnpm install && pnpm --filter @repo/ui test`
Expected: **FAIL** — `["hooks -> @repo/ui/hooks"]` is unresolvable.

- [ ] **Step 3: Fix the exports map**

In `packages/ui/package.json`, replace the `exports` block:

```json
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts"
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @repo/ui test`
Expected: **PASS.**

- [ ] **Step 5: Pin shadcn to Radix in the package's rules**

In `packages/ui/CLAUDE.md`, replace the "Add a component" bullet:

```markdown
- Add a component: `npx shadcn@latest add <name> -c packages/ui -b radix`. **The `-b radix` flag is not optional** — shadcn switched its default primitive library to Base UI in July 2026, and `components.json` has no field to pin it, so a bare `add` will pull Base UI components into this Radix-based system (they have no `asChild`/Slot, so they will not compose with `button.tsx`/`card.tsx`). After adding, `grep -r "@base-ui" packages/ui` must return nothing. You own the source — extend it in place.
```

And in the Radix bullet, keep the existing rule but note where the components come from:

```markdown
- Radix primitives come from the unified `radix-ui` package, not `@radix-ui/react-*`. This is what the registry emits for Tailwind v4 projects (the `new-york-v4` style), so `shadcn add … -b radix` already produces the right import — do not hand-migrate it.
```

- [ ] **Step 6: Verify the full gate for the package**

Run: `pnpm --filter @repo/ui lint && pnpm --filter @repo/ui check-types && pnpm --filter @repo/ui test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json packages/ui/CLAUDE.md packages/ui/test/exports.test.ts packages/ui/vitest.config.ts pnpm-lock.yaml
git commit -m "fix(ui): export the hooks subpath, and pin shadcn to Radix

components.json declared a \`hooks\` alias that package.json never exported, so
\`shadcn add sidebar\` (which pulls use-mobile into that alias) produced an app
that died on ERR_PACKAGE_PATH_NOT_EXPORTED — and sidebar is the component a
dashboard needs most.

Separately, shadcn made Base UI its default primitive in July 2026 and
components.json has no field to pin the choice, so the bare \`shadcn add\` this
package's own CLAUDE.md prescribed would now mix Base UI into a Radix system.
The rule now requires \`-b radix\`.

New test asserts every components.json alias resolves through package.json's
exports — the class of bug that only shows up at import time."
```

---

### Task 6: Dev CSP — stop emitting a policy the browser ignores

`packages/config/src/csp.ts:93-97` builds a dev `style-src` of
`'self' 'nonce-<n>' 'unsafe-inline'`. Per the CSP spec, **a nonce makes the browser
ignore `'unsafe-inline'`** — so the dev relaxation does nothing and the dev console
fills with style-src violations (56 per page load, measured). The code comment at
`csp.ts:62` already concedes the policy is "contradictory". Production is correct and
must not change.

**Files:**

- Modify: `packages/config/src/csp.ts`
- Modify: `packages/config/test/csp.test.ts:70-72`
- Modify: `packages/config/CLAUDE.md` (the prod-stays-strict bullet describes dev too)

- [ ] **Step 1: Update the test to pin the CORRECT dev contract**

In `packages/config/test/csp.test.ts`, replace the dev style-src assertion (currently at
:70-72):

```ts
it("drops the nonce from style-src in dev so 'unsafe-inline' actually applies", () => {
  // Per the CSP spec a nonce makes the browser IGNORE 'unsafe-inline'. Emitting
  // both (as this used to) means the dev server's un-nonced inline styles are
  // still blocked — the relaxation is a no-op and the console fills with
  // violations. In dev we therefore drop the nonce from style-src only.
  expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  expect(csp).not.toContain("style-src 'self' 'nonce-N'");
});
```

Also add a guard that production is untouched — inside the existing prod `describe`
block (the one built with `isDev: false` at :27):

```ts
it("keeps the nonce on style-src in production", () => {
  expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
  expect(csp).not.toContain("'unsafe-inline' 'nonce-");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/config test`
Expected: **FAIL** on the dev test — the built policy is still
`style-src 'self' 'nonce-N' 'unsafe-inline'`.

- [ ] **Step 3: Implement**

In `packages/config/src/csp.ts`, replace the `styleSrc` computation (:93-97):

```ts
// In DEV the Next dev server injects un-nonced inline <style>. A nonce makes the
// browser IGNORE 'unsafe-inline' entirely (CSP spec), so emitting both leaves those
// styles blocked and floods the console with violations. Dev therefore uses
// 'unsafe-inline' WITHOUT a nonce; production keeps the nonce and stays strict.
const styleSrc = isDev
  ? ["'self'", "'unsafe-inline'"].join(" ")
  : ["'self'", `'nonce-${nonce}'`].join(" ");
```

And update the `style-src` bullet in the doc comment above `buildContentSecurityPolicy`
(:60-63):

```ts
 * - `style-src 'self' 'nonce-<n>'` — same-origin stylesheets plus Next/`next/font`
 *   inline `<style>` carrying the nonce. In DEV the nonce is dropped and
 *   `'unsafe-inline'` used instead: a nonce makes the browser ignore
 *   `'unsafe-inline'`, so emitting both would leave the dev server's un-nonced
 *   styles blocked. Production keeps the nonce and never gets `'unsafe-inline'`.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @repo/config test`
Expected: **PASS.**

- [ ] **Step 5: Verify the real dev console is now clean**

```bash
pnpm dev --filter=web
```

Open `http://localhost:3000` and check the browser console. Expected: **zero**
`Refused to apply inline style` / style-src violations (there were 56 per load). Stop
the server.

- [ ] **Step 6: Verify production is untouched**

Run: `pnpm test:e2e`
Expected: `apps/web/e2e/security-headers.spec.ts` still green — it asserts **zero** CSP
violations and a unique per-request nonce against the production build. This is the
proof that the prod policy did not regress.

- [ ] **Step 7: Update the package rules**

In `packages/config/CLAUDE.md`, amend the "Prod stays strict" bullet to state the dev
rule explicitly:

```markdown
- **Prod stays strict**: production `script-src`/`style-src` never get `'unsafe-eval'`/`'unsafe-inline'` (only `style-src-attr` gets `'unsafe-inline'`, which nonces can't cover). `isDev: true` adds the dev-only relaxations React's overlay needs — pass `process.env.NODE_ENV === "development"`. **In dev, `style-src` drops the nonce and uses `'unsafe-inline'` instead**: a nonce makes the browser ignore `'unsafe-inline'`, so emitting both would block the dev server's un-nonced styles anyway and flood the console.
```

- [ ] **Step 8: Commit**

```bash
git add packages/config/src/csp.ts packages/config/test/csp.test.ts packages/config/CLAUDE.md
git commit -m "fix(config): make the dev CSP relaxation actually apply

The dev style-src was 'self' 'nonce-<n>' 'unsafe-inline'. Per the CSP spec a
nonce makes the browser IGNORE 'unsafe-inline', so the relaxation was a no-op:
the dev server's un-nonced inline styles stayed blocked and the console took 56
violations per page load. The code comment already conceded the policy was
contradictory.

Dev now emits 'self' 'unsafe-inline' with no nonce. Production is unchanged —
still 'self' 'nonce-<n>', still no 'unsafe-inline' — and the security-headers
e2e (zero violations, unique per-request nonce) proves it."
```

---

### Task 7: Generator UX — rendered messages and a free default port

Two papercuts in the scaffolder's output:

1. `turbo/generators/config.ts:75,139,153` pass **string** actions to plop, which prints
   them verbatim — the user sees literal Handlebars:
   `Run pnpm dev --filter={{ dashCase name }} (port {{ port }})`.
2. The default port is `3200` (`config.ts:94`), which `apps/admin` already uses
   (`apps/admin/package.json:7`). Taken: 3000 (web dev), 3100 (web e2e), 3200 (admin
   dev), 3300 (admin e2e). The first free port is **3400**. `README.md:120` repeats the
   clash.

**Files:**

- Modify: `turbo/generators/config.ts`
- Modify: `README.md:113-126`

- [ ] **Step 1: Make the messages render**

Plop only interpolates its _template files_, not string actions. Build the strings from
the answers instead. In `turbo/generators/config.ts`, replace the string action at the
end of `PACKAGE_ACTIONS` (:75) by converting the constant into a function — replace:

```ts
const PACKAGE_ACTIONS: PlopTypes.ActionType[] = [
```

with:

```ts
const PACKAGE_FILE_ACTIONS: PlopTypes.ActionType[] = [
```

then, after that array's closing `];`, remove the trailing string entry and add:

```ts
/**
 * Plop prints STRING actions verbatim — it does not run them through Handlebars — so a
 * literal "{{ dashCase name }}" would reach the user. Build the message from the actual
 * answers instead. (Names are validated as kebab-case, so `name` is already dash-cased.)
 */
function packageActions(
  data?: Record<string, unknown>,
): PlopTypes.ActionType[] {
  const name = String(data?.name ?? "").trim();
  return [
    ...PACKAGE_FILE_ACTIONS,
    `\nScaffolded packages/${name} (@repo/${name}). Run \`pnpm install\` to link it.`,
  ];
}
```

Replace the `appActions` message (:139):

```ts
function appActions(data?: Record<string, unknown>): PlopTypes.ActionType[] {
  const name = String(data?.name ?? "").trim();
  const port = String(data?.port ?? DEFAULT_APP_PORT).trim();
  const pwa = isTruthy(data?.pwa) ? APP_PWA_ACTIONS : [];
  return [
    ...APP_BASE_ACTIONS,
    ...pwa,
    `\nScaffolded apps/${name}. Run \`pnpm install\`, then \`pnpm dev --filter=${name}\` (port ${port}).`,
  ];
}
```

Replace `REACT_COMPONENT_ACTIONS` (:147-154) the same way — rename the array to
`REACT_COMPONENT_FILE_ACTIONS` (dropping its trailing string) and add:

```ts
function reactComponentActions(
  data?: Record<string, unknown>,
): PlopTypes.ActionType[] {
  const name = String(data?.name ?? "").trim();
  return [
    ...REACT_COMPONENT_FILE_ACTIONS,
    `\nScaffolded packages/ui/src/components/ui/${name}.tsx. Import it as \`@repo/ui/components/ui/${name}\`.`,
  ];
}
```

- [ ] **Step 2: Free the default port**

Add near `KEBAB_CASE` (:23):

```ts
/**
 * First dev port not already taken: 3000 = web dev, 3100 = web e2e, 3200 = admin dev,
 * 3300 = admin e2e (see each app's playwright.config.ts).
 */
const DEFAULT_APP_PORT = "3400";
```

In `APP_PROMPTS` (:92-102), update the port question:

```ts
  {
    type: "input",
    name: "port",
    message: "Dev port (3000/3100/3200/3300 are taken by web + admin):",
    default: DEFAULT_APP_PORT,
    validate: (input: unknown) => {
      const value = String(input).trim();
      if (!/^\d{2,5}$/.test(value)) return "Port must be a number.";
      const n = Number(value);
      if (n < 1 || n > 65535) return "Port must be 1–65535.";
      return true;
    },
  },
```

- [ ] **Step 3: Point the generators at the new action functions**

In the `generator()` export (:156-191), replace every `actions: PACKAGE_ACTIONS` with
`actions: packageActions` (both `package` and `add-package`), and
`actions: REACT_COMPONENT_ACTIONS` with `actions: reactComponentActions`. `app` and
`add-app` already use `actions: appActions`.

Also update the head-less usage examples in the file's doc comment (:14-15):

```ts
 *   pnpm gen app --args my-app 3400          # plain app
 *   pnpm gen app --args my-app 3400 true     # PWA app (installable + offline)
```

- [ ] **Step 4: Verify the messages render and the port is free**

```bash
pnpm gen package --args msg-check
```

Expected output contains `Scaffolded packages/msg-check (@repo/msg-check).` — **no**
literal `{{`. Then:

```bash
pnpm gen app --args port-check 3400 true
```

Expected: `Scaffolded apps/port-check. Run \`pnpm install\`, then \`pnpm dev --filter=port-check\` (port 3400).`

Clean up:

```bash
rm -rf packages/msg-check apps/port-check
git status --short   # must be clean apart from the files this task edits
```

- [ ] **Step 5: Fix the README**

In `README.md:113-126`, update the headless example and the port note:

````markdown
### Scaffolding a PWA app

`pnpm gen app` scaffolds an installable + offline PWA in one step:

```sh
pnpm gen app            # interactive — answer "y" to "Make it a PWA?"
# or headless (3000/3100/3200/3300 are taken by web + admin):
pnpm gen app --args my-app 3400 true
```
````

It adds a manifest, an app-owned service worker, an `/offline` page, a
placeholder `app/icon.svg`, and a nonce-CSP `proxy.ts` (whose strict policy the
generated root layout opts into via `await connection()`). Replace the icon with
real PNGs (`public/icons/`) before shipping. To add web push, pull in
`@repo/pwa/push` (+ `@repo/db`); for an install button, `@repo/pwa/install`.

````

- [ ] **Step 6: Type-check and lint the generator**

Run: `pnpm check-types && pnpm lint`
Expected: green. (`turbo/generators/config.ts` is type-checked by the root tsconfig.)

- [ ] **Step 7: Commit**

```bash
git add turbo/generators/config.ts README.md
git commit -m "fix(gen): render the success message, and default to a free port

Plop prints string actions verbatim rather than running them through Handlebars,
so \`pnpm gen\` told users to run \`pnpm dev --filter={{ dashCase name }} (port
{{ port }})\`. The messages are now built from the answers.

The default port was 3200, which apps/admin already uses. Taken: 3000 web dev,
3100 web e2e, 3200 admin dev, 3300 admin e2e. Defaults to 3400 now, and the
prompt + README say which are taken."
````

---

## Final gate + PR

- [ ] **Step 1: Run the complete gate**

```bash
pnpm lint && pnpm check-types && pnpm build && pnpm test && pnpm test:e2e
pnpm --filter admin test:e2e
```

Expected: all green. Read the output — do not infer success from an exit code.

- [ ] **Step 2: Confirm the working tree is clean**

```bash
git status --short
```

Expected: no stray `apps/csp-smoke`, `apps/plain-smoke`, `apps/port-check`,
`packages/msg-check`, and no unintended `pnpm-lock.yaml` diff. (`pnpm-lock.yaml` SHOULD
change in Task 5 — vitest was added to `@repo/ui`.)

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin fix/pr1-blockers-and-drift-gates
gh pr create --title "PR 1 — stop the bleeding + drift gates" --body "$(cat <<'EOF'
First of the seven PRs in `docs/superpowers/specs/2026-07-11-starter-hardening-design.md`.

Fixes six Blocker-class defects a new project hits on day 0, and lands a gate for each
so it cannot silently return.

| Fix | Gate |
| --- | --- |
| `engines.node` said `>=20`; pnpm 11.3 needs `>=22.13` (CI already knew) | `scripts/repo-invariants.test.mjs` derives the floor from the pinned pnpm major and cross-checks the CLI manifest + CI matrix |
| App generator pinned TypeScript 5.9.2 (workspace: 6.0.3) | same suite |
| Dockerfile copied 16 of 21 workspace manifests → image did not build | static manifest diff + a real `docker build` CI job |
| **Generated PWA apps were dead HTML in production** — no `await connection()`, so a static page carried no nonce and `'strict-dynamic'` blocked all 13 scripts. Dev hid it entirely | `scaffold-smoke` CI job: scaffold → production build → assert every `<script>` carries the nonce |
| `isDistributedRateLimitEnabled()` defined, never called — in-memory limiter silently per-instance in production | unit test: warns once, production only |
| `@repo/ui` declared a `hooks` alias it never exported (`shadcn add sidebar` → `ERR_PACKAGE_PATH_NOT_EXPORTED`); shadcn now defaults to Base UI | contract test: every `components.json` alias must resolve through `exports` |
| Dev CSP emitted nonce + `'unsafe-inline'` — the spec makes the browser ignore the latter, so the relaxation was a no-op (56 console violations/load) | `csp.test.ts` pins both the dev and prod contracts; e2e proves prod is unchanged |

Every gate was proven to go **red** against the current code before the fix made it
green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Fry1shuxZgC3EW977wvLfu
EOF
)"
```

- [ ] **Step 4: Verify CI green, then ff-merge**

```bash
gh run watch
gh run view --log | grep -E "scaffold-smoke|docker|✓|✗|FAIL"
```

Read the `scaffold-smoke` and `docker` job logs specifically — they are new, and a
green summary on a job that silently skipped is exactly the failure mode this PR exists
to eliminate. Then ff-merge to `main`.

---

## Self-review notes

- **Spec coverage:** every PR-1 row in the spec's table maps to a task here — engines
  (T1), `connection()` (T3), Dockerfile (T2), rate-limit warning (T4), `hooks` export
  (T5), `-b radix` (T5), dev-CSP noise (T6), generator message + README port (T7). The
  spec's two named gates (`gen app` smoke, `docker build` smoke) are T3/T2.
- **Beyond the spec:** T1 also fixes the app template's TypeScript pin (5.9.2 vs the
  workspace's 6.0.3) — found while reading the template for T3, same drift class.
- **Scope correction vs. the spec:** the spec said "add `await connection()` to the app
  generator's root layout" without qualification. Reading `config.ts:130` and
  `next.config.ts.hbs:2-13` shows `proxy.ts`/CSP are **PWA-only**, so applying it
  unconditionally would strip static rendering from non-PWA apps for no benefit. T3
  scopes it to the PWA branch and adds Step 5 to prove non-PWA apps stay `○ (Static)`.
