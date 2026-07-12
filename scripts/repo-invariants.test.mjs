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
