import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

/**
 * List the immediate subdirectories of a directory, filtering out any
 * non-directory entries (stray files, .DS_Store, etc). Used to discover
 * workspaces and generator templates by walking the filesystem instead of
 * hardcoding a list — so a newly added package or template can't skip the gate.
 */
const subdirs = (relDir) =>
  readdirSync(join(repoRoot, relDir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

test("one TypeScript version governs every workspace and generator template", () => {
  const rootPin = readJson("package.json").devDependencies.typescript;
  const offenders = [];

  const checkExactManifest = (relPath) => {
    const pkg = readJson(relPath);
    const pinned = pkg.dependencies?.typescript ?? pkg.devDependencies?.typescript;
    if (pinned !== undefined && pinned !== rootPin) offenders.push({ relPath, pinned });
  };

  const checkTemplateManifest = (relPath) => {
    const pinned = read(relPath).match(/"typescript":\s*"([^"]+)"/)?.[1];
    if (pinned !== undefined && pinned !== rootPin) offenders.push({ relPath, pinned });
  };

  // Every workspace manifest (apps/*/package.json, packages/*/package.json).
  for (const group of ["apps", "packages"]) {
    for (const name of subdirs(group)) {
      const relPath = join(group, name, "package.json");
      if (existsSync(join(repoRoot, relPath))) checkExactManifest(relPath);
    }
  }

  // Every generator template's package.json.hbs. These aren't valid JSON (they
  // contain raw Handlebars block helpers like `{{#if pwa}}` outside of string
  // values), so they're pattern-matched like the workspace check above, not parsed.
  const templatesDir = "turbo/generators/templates";
  for (const name of subdirs(templatesDir)) {
    const relPath = join(templatesDir, name, "package.json.hbs");
    if (existsSync(join(repoRoot, relPath))) checkTemplateManifest(relPath);
  }

  assert.equal(
    offenders.length,
    0,
    "One TypeScript version must govern the whole repo (root devDependencies.typescript " +
      `= "${rootPin}"). A workspace or generator template that pins a different compiler ` +
      "type-checks against a version the shared @repo/typescript-config was never written " +
      "for. A range (e.g. a caret) is just as bad even when it currently resolves to the " +
      "same version: typescript-eslint's supported range is \"<6.1.0\", so the day TS 6.1 " +
      "ships, a floated package silently jumps onto an unsupported compiler and its lint " +
      "behavior diverges from the rest of the repo. Pin the exact string instead.\n" +
      offenders
        .map(({ relPath, pinned }) => `  - ${relPath}: pins "${pinned}", expected "${rootPin}"`)
        .join("\n"),
  );
});
