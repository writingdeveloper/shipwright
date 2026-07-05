import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  applyPlan,
  buildPlan,
  isDeniedPath,
  parseArgs,
  slugify,
} from "./rename.mjs";

/**
 * Unit tests for `pnpm rename` (scripts/rename.mjs), run with
 * `node --test scripts/`. They drive the pure planning/apply functions against
 * a throwaway fixture tree so the real repo is never touched.
 */

/** Build a minimal fixture repo containing allowlisted + denylisted files. */
function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "rename-fixture-"));
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  };

  write("package.json", '{\n  "name": "shipwright",\n  "private": true\n}\n');
  write(
    "apps/web/lib/site.ts",
    'import { defaultLegalConfig } from "@repo/legal"; // keeps ?? "Shipwright" docs\n' +
      'export const SITE_NAME = env.NEXT_PUBLIC_APP_NAME ?? "Shipwright";\n',
  );
  write(
    "apps/web/public/sw.js",
    "const CACHE_NAME = `shipwright-${CACHE_VERSION}`;\n" +
      '  const title = data.title || "Shipwright";\n',
  );
  write(
    "apps/web/e2e/ux.spec.ts",
    'for (const [path, heading] of [\n    ["/", "Shipwright"],\n  ]) {}\n',
  );
  // Denylisted: same brand strings, must pass through untouched.
  write(
    "packages/create-shipwright/src/index.ts",
    'const CLI_NAME = "create-shipwright"; // Shipwright\n',
  );
  return root;
}

function readFixture(root, rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const OPTS = { display: "Acme Demo", slug: "acme-demo", docs: false };

test("slugify dash-cases a display name", () => {
  assert.equal(slugify("Acme"), "acme");
  assert.equal(slugify("My Cool App"), "my-cool-app");
  assert.equal(slugify("  Acme  2.0! "), "acme-2-0");
});

test("parseArgs refuses an empty/whitespace display name", () => {
  assert.throws(() => parseArgs([]), /display name/i);
  assert.throws(() => parseArgs(["   "]), /display name/i);
});

test("parseArgs picks up flags and derives the slug", () => {
  const args = parseArgs(["My Cool App", "--dry-run"]);
  assert.equal(args.display, "My Cool App");
  assert.equal(args.slug, "my-cool-app");
  assert.equal(args.dryRun, true);
  assert.equal(args.docs, false);
});

test("denylisted paths are recognised (hard guard)", () => {
  for (const denied of [
    "packages/create-shipwright/src/index.ts",
    ".changeset/config.json",
    ".github/workflows/ci.yml",
    "docs/superpowers/x.md",
    "docs/eval-mvp-acceleration-2026-06-23.md",
    "pnpm-lock.yaml",
    "node_modules/x/package.json",
    ".git/config",
  ]) {
    assert.equal(isDeniedPath(denied), true, `${denied} should be denied`);
  }
  assert.equal(isDeniedPath("apps/web/lib/site.ts"), false);
});

test("allowlisted patterns are rewritten; denylisted files are never planned", () => {
  const root = makeFixture();
  try {
    const plan = buildPlan(root, OPTS);
    const files = plan.map((p) => p.file);

    assert.ok(files.includes("package.json"));
    assert.ok(files.includes("apps/web/lib/site.ts"));
    assert.ok(!files.some((f) => f.startsWith("packages/create-shipwright/")));

    applyPlan(root, plan, { dryRun: false });

    assert.match(readFixture(root, "package.json"), /"name": "acme-demo"/);
    assert.match(
      readFixture(root, "apps/web/lib/site.ts"),
      /\?\? "Acme Demo";/,
    );
    assert.match(
      readFixture(root, "apps/web/public/sw.js"),
      /`acme-demo-\$\{CACHE_VERSION\}`/,
    );
    assert.match(
      readFixture(root, "apps/web/public/sw.js"),
      /data\.title \|\| "Acme Demo"/,
    );
    assert.match(readFixture(root, "apps/web/e2e/ux.spec.ts"), /"Acme Demo"/);
    // Denylisted fixture is byte-identical.
    assert.equal(
      readFixture(root, "packages/create-shipwright/src/index.ts"),
      'const CLI_NAME = "create-shipwright"; // Shipwright\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a line containing "@repo/" is never rewritten', () => {
  const root = makeFixture();
  try {
    applyPlan(root, buildPlan(root, OPTS), { dryRun: false });
    const site = readFixture(root, "apps/web/lib/site.ts");
    // The import line keeps its literal, the real fallback line was rewritten.
    assert.match(site, /"@repo\/legal"; \/\/ keeps \?\? "Shipwright" docs/);
    assert.match(site, /SITE_NAME = env\.NEXT_PUBLIC_APP_NAME \?\? "Acme Demo";/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--dry-run writes nothing", () => {
  const root = makeFixture();
  try {
    const before = readFixture(root, "package.json");
    const plan = buildPlan(root, OPTS);
    assert.ok(plan.length > 0);
    applyPlan(root, plan, { dryRun: true });
    assert.equal(readFixture(root, "package.json"), before);
    assert.match(readFixture(root, "apps/web/lib/site.ts"), /"Shipwright"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("running twice is idempotent", () => {
  const root = makeFixture();
  try {
    applyPlan(root, buildPlan(root, OPTS), { dryRun: false });
    const first = readFixture(root, "apps/web/lib/site.ts");

    const secondPlan = buildPlan(root, OPTS);
    assert.equal(secondPlan.length, 0, "second run should plan zero edits");
    applyPlan(root, secondPlan, { dryRun: false });
    assert.equal(readFixture(root, "apps/web/lib/site.ts"), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
