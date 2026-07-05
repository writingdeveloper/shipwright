#!/usr/bin/env node
/**
 * `pnpm rename "<Display Name>"` — one-command downstream rebrand.
 *
 * Phase 1 of the branding work made the RUNTIME app name env-driven
 * (`NEXT_PUBLIC_APP_NAME`). This script rewrites the STATIC identity that env
 * cannot reach — the `?? "Shipwright"` source fallbacks, package/deploy names,
 * the static service worker, and the e2e assertions that pin the fallback —
 * so a downstream owner rebrands a fresh clone in one command instead of a
 * risky find-replace.
 *
 *   pnpm rename "Acme"                 # rewrite the allowlist below
 *   pnpm rename "My Cool App" --dry-run  # print the full plan, write nothing
 *   pnpm rename "Acme" --docs          # ALSO rewrite product docs (README/DEPLOY)
 *
 * Design rules:
 * - ALLOWLIST ONLY: each edit is a precise, per-file literal match — never a
 *   blind global find-replace (that corrupts the CLI/CI, the exact failure
 *   mode this tool exists to prevent).
 * - Hard DENYLIST: create-shipwright, .changeset, .github, lockfiles, the
 *   @repo/* scope, and intentional product-identity strings are untouchable.
 * - Idempotent: a second run finds nothing to do and plans zero edits.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Arg parsing / derivation
// ---------------------------------------------------------------------------

/** Dash-case a display name: "My Cool App" -> "my-cool-app". */
export function slugify(display) {
  return display
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parse CLI argv (after node + script). Throws on invalid input. */
export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positionals = argv.filter((a) => !a.startsWith("--"));

  for (const flag of flags) {
    if (flag !== "--dry-run" && flag !== "--docs") {
      throw new Error(`Unknown flag ${flag}. Known: --dry-run, --docs`);
    }
  }
  if (positionals.length > 1) {
    throw new Error(
      `Expected ONE display name, got ${positionals.length} — quote it: pnpm rename "My Cool App"`,
    );
  }

  const display = (positionals[0] ?? "").trim();
  if (!display) {
    throw new Error('A display name is required: pnpm rename "<Display Name>"');
  }
  // The name is spliced into JS/JSON string literals — refuse characters that
  // would escape them rather than trying to quote our way around it.
  if (/["`\\\n\r]/.test(display)) {
    throw new Error(
      "The display name must not contain quotes, backticks, or backslashes.",
    );
  }
  const slug = slugify(display);
  if (!slug) {
    throw new Error(`"${display}" produces an empty slug — use letters/numbers.`);
  }

  return { display, slug, dryRun: flags.has("--dry-run"), docs: flags.has("--docs") };
}

// ---------------------------------------------------------------------------
// Denylist (hard guard)
// ---------------------------------------------------------------------------

const DENIED_PREFIXES = [
  "packages/create-shipwright/",
  ".changeset/",
  ".github/",
  "docs/superpowers/",
  "node_modules/",
  ".next/",
  ".turbo/",
  "dist/",
  "test-results/",
  ".git/",
];

const DENIED_FILES = new Set(["pnpm-lock.yaml"]);

/** True when a repo-relative path must never be rewritten. */
export function isDeniedPath(relPath) {
  const p = relPath.replaceAll("\\", "/");
  if (DENIED_FILES.has(p)) return true;
  if (/^docs\/eval-/.test(p)) return true;
  return DENIED_PREFIXES.some(
    (prefix) => p.startsWith(prefix) || p.includes(`/${prefix}`),
  );
}

// ---------------------------------------------------------------------------
// The allowlist: file -> precise literal replacements
// ---------------------------------------------------------------------------

/**
 * Each entry: `{ file, pairs(ctx) }` returning `[before, after]` literals, or
 * `{ file, transform(ctx, content) }` for the region-scoped docs rewrites.
 * `docs: true` entries run only under `--docs`.
 */
function allowlist({ display, slug }) {
  const pair = (before, after) => [before, after];
  return [
    {
      file: "package.json",
      pairs: [pair('"name": "shipwright"', `"name": "${slug}"`)],
    },
    {
      file: "apps/web/wrangler.jsonc",
      pairs: [pair('"name": "shipwright-web"', `"name": "${slug}-web"`)],
    },
    {
      file: "apps/web/public/sw.js",
      pairs: [
        pair("const CACHE_NAME = `shipwright-", `const CACHE_NAME = \`${slug}-`),
        pair('data.title || "Shipwright"', `data.title || "${display}"`),
      ],
    },
    {
      file: "apps/web/lib/site.ts",
      pairs: [pair('?? "Shipwright"', `?? "${display}"`)],
    },
    {
      file: "apps/admin/app/layout.tsx",
      pairs: [pair('?? "Shipwright"', `?? "${display}"`)],
    },
    // e2e specs pin the fallback text the two edits above change — they must
    // move in lockstep or `pnpm test:e2e` breaks. Match the SPECIFIC assertion
    // strings only.
    {
      file: "apps/web/e2e/ux.spec.ts",
      pairs: [pair('["/", "Shipwright"]', `["/", "${display}"]`)],
    },
    {
      file: "apps/web/e2e/seo-legal.spec.ts",
      pairs: [
        pair("<title>Shipwright</title>", `<title>${display}</title>`),
        pair('content="Shipwright"', `content="${display}"`),
      ],
    },
    {
      file: "apps/web/e2e/seo-geo.spec.ts",
      pairs: [pair('"# Shipwright"', `"# ${display}"`)],
    },
    {
      file: "apps/web/e2e/pwa.spec.ts",
      pairs: [
        pair('startsWith("shipwright-")', `startsWith("${slug}-")`),
        pair("`shipwright-<version>`", `\`${slug}-<version>\``),
      ],
    },
    // Product docs, opt-in via --docs.
    {
      file: "README.md",
      docs: true,
      label: "(intro brand mentions: title + opening paragraphs)",
      transform: (content) => renameDocsIntro(content, display),
    },
    {
      file: "DEPLOY.md",
      docs: true,
      label: "(brand mentions across the deploy guide)",
      transform: (content) =>
        content
          .replaceAll(/\bshipwright-/g, `${slug}-`)
          .replaceAll(/\bshipwright\b/gi, display),
    },
  ];
}

/**
 * README: rewrite the brand only in the intro region (title + opening
 * paragraphs, i.e. everything before the first `## ` section) — the body
 * documents the starter's own packages and stays put.
 */
function renameDocsIntro(content, display) {
  const bodyStart = content.search(/^## /m);
  if (bodyStart === -1) return content.replaceAll(/\bshipwright\b/gi, display);
  const intro = content.slice(0, bodyStart).replaceAll(/\bshipwright\b/gi, display);
  return intro + content.slice(bodyStart);
}

// ---------------------------------------------------------------------------
// Plan / apply
// ---------------------------------------------------------------------------

/**
 * Apply literal `pairs` to `content` line-by-line, skipping any line that
 * mentions the internal `@repo/` scope (never rewritten, per the denylist).
 * Returns `{ next, edits }` where edits carry counts for the dry-run report.
 */
function applyPairs(content, pairs) {
  const lines = content.split("\n");
  const edits = [];
  for (const [before, after] of pairs) {
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(before)) continue;
      if (lines[i].includes("@repo/")) continue; // hard guard
      count += lines[i].split(before).length - 1;
      lines[i] = lines[i].replaceAll(before, after);
    }
    if (count > 0) edits.push({ before, after, count });
  }
  return { next: lines.join("\n"), edits };
}

/**
 * Build the full plan for a repo rooted at `rootDir`. Pure with respect to the
 * filesystem: reads only, never writes. Missing allowlist files are skipped
 * (a downstream owner may have deleted e.g. wrangler.jsonc).
 */
export function buildPlan(rootDir, { display, slug, docs = false }) {
  const plan = [];
  for (const entry of allowlist({ display, slug })) {
    if (entry.docs && !docs) continue;
    if (isDeniedPath(entry.file)) {
      throw new Error(`BUG: allowlist entry ${entry.file} is denylisted.`);
    }
    const abs = path.join(rootDir, entry.file);
    if (!existsSync(abs)) continue;

    const content = readFileSync(abs, "utf8");
    let next = content;
    let edits = [];
    if (entry.transform) {
      next = entry.transform(content);
      if (next !== content) {
        edits = [{ before: entry.label, after: display, count: 1 }];
      }
    } else {
      ({ next, edits } = applyPairs(content, entry.pairs));
    }
    if (next !== content) {
      plan.push({ file: entry.file, edits, newContent: next });
    }
  }
  return plan;
}

/** Write the planned contents (no-op under dryRun). Re-checks the denylist. */
export function applyPlan(rootDir, plan, { dryRun }) {
  for (const { file, newContent } of plan) {
    if (isDeniedPath(file)) {
      throw new Error(`BUG: refusing to write denylisted path ${file}.`);
    }
    if (!dryRun) writeFileSync(path.join(rootDir, file), newContent, "utf8");
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`rename: ${error.message}`);
    process.exit(1);
  }

  const rootDir = process.cwd();
  const plan = buildPlan(rootDir, args);
  const mode = args.dryRun ? "DRY RUN — nothing written" : "writing";

  console.log(
    `rename: "${args.display}" (slug "${args.slug}")${args.docs ? " + docs" : ""} — ${mode}\n`,
  );
  if (plan.length === 0) {
    console.log("Nothing to do — already renamed (or patterns not found).");
    return;
  }
  for (const { file, edits } of plan) {
    console.log(file);
    for (const { before, after, count } of edits) {
      console.log(`  ${JSON.stringify(before)} -> ${JSON.stringify(after)} (x${count})`);
    }
  }

  applyPlan(rootDir, plan, { dryRun: args.dryRun });
  if (!args.dryRun) {
    console.log(
      `\nDone — ${plan.length} file(s) rewritten. Review with \`git diff\`, then run pnpm check-types && pnpm test.`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
