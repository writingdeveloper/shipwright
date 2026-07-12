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

/** Every workspace that pnpm must see to resolve the dependency graph. */
function workspaceManifests() {
  const found = [];
  for (const root of ["apps", "packages"]) {
    for (const name of subdirs(root)) {
      const rel = `${root}/${name}/package.json`;
      if (existsSync(join(repoRoot, rel))) found.push(rel);
    }
  }
  return found.sort();
}

/**
 * `workspaceManifests()` above (and the TypeScript-pin test below) hardcode the
 * workspace globs `apps/*` and `packages/*` instead of parsing them out of
 * `pnpm-workspace.yaml` — that keeps this suite dependency-free (plain
 * `readdirSync`, no YAML parser), but it is only safe as long as those literals
 * match pnpm's real config. If a third glob is ever added (e.g. `tooling/*`),
 * pnpm would resolve those workspaces fine — but this suite would silently stop
 * checking them, staying green while the Dockerfile's deps stage (and the
 * TypeScript pin) quietly stopped covering them too. This test is the tripwire:
 * it fails loudly instead of letting the suite's scope narrow in silence.
 */
test("pnpm-workspace.yaml's package globs are exactly the ones this suite walks", () => {
  const workspaceYaml = read("pnpm-workspace.yaml");
  // `\r?\n` throughout: this file (like the rest of the repo, on a Windows/CRLF
  // checkout) may use CRLF line endings, and a bare `\n` would never match "the
  // line right after `packages:`" when the real byte there is `\r`.
  const packagesBlock = workspaceYaml.match(/^packages:\r?\n((?:[ \t]+-.*\r?\n?)+)/m);
  assert.ok(packagesBlock, "pnpm-workspace.yaml must have a top-level `packages:` list.");

  const globs = packagesBlock[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-\s*/, "").replace(/^["']|["']$/g, ""));

  assert.deepEqual(
    globs,
    ["apps/*", "packages/*"],
    `pnpm-workspace.yaml's package globs are now ${JSON.stringify(globs)}, not the ` +
      '["apps/*", "packages/*"] this suite hardcodes — a new workspace glob was added. ' +
      "Teach workspaceManifests() (and the TypeScript-pin test's workspace walk) about it, " +
      "or the Docker and TypeScript gates will silently stop covering it.",
  );
});

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

  // Every workspace manifest (apps/*/package.json, packages/*/package.json). Shares
  // workspaceManifests() with the Dockerfile test below so there is exactly ONE walk
  // of the workspace tree, and one path format (forward slashes, even on Windows) in
  // every failure message this suite prints.
  for (const relPath of workspaceManifests()) checkExactManifest(relPath);

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

/** The one `COPY` line that makes `<dir>/package.json` reachable inside `deps`. */
const copyLineFor = (rel) => `COPY ${rel} ./${rel.slice(0, -"/package.json".length)}/`;

test("the Dockerfile's deps stage copies every workspace manifest", () => {
  const dockerfile = read("Dockerfile");
  const lines = dockerfile.split("\n");

  // Scope the check to the `deps` stage: from its `FROM ... AS deps` line up
  // to (but excluding) the next `FROM` line, or EOF if `deps` is the last
  // stage. `pnpm install --frozen-lockfile` runs inside `deps`, not `builder`
  // or `runner` — a COPY anywhere else does not help pnpm resolve the
  // workspace graph.
  const depsStart = lines.findIndex((line) =>
    /^FROM\s+\S+\s+AS\s+deps\s*$/i.test(line.trim()),
  );
  assert.ok(
    depsStart !== -1,
    "Dockerfile has no `FROM ... AS deps` stage. `pnpm install --frozen-lockfile` (and every " +
      "workspace manifest this test checks for) is expected to run there — without the stage " +
      "itself, an empty slice would make every check below vacuously pass.",
  );
  const nextFromOffset = lines
    .slice(depsStart + 1)
    .findIndex((line) => /^FROM\s+/i.test(line.trim()));
  const depsEnd = nextFromOffset === -1 ? lines.length : depsStart + 1 + nextFromOffset;
  const depsLines = lines.slice(depsStart + 1, depsEnd);

  // For a manifest at `<dir>/package.json`, only a real (non-comment) line
  // reading exactly `COPY <dir>/package.json ./<dir>/` counts. pnpm resolves
  // workspaces by their path inside /app, so a commented-out line, one in the
  // wrong stage, or one landing at the wrong destination all leave the
  // manifest unreachable even though its name appears in the file somewhere.
  const missing = workspaceManifests().filter((rel) => {
    const expected = copyLineFor(rel);
    return !depsLines.some((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("#") && trimmed === expected;
    });
  });

  assert.deepEqual(
    missing,
    [],
    `The deps stage is missing ${missing.length} workspace manifest(s) — no active ` +
      "`COPY <manifest> ./<dir>/` line for it inside the `deps` stage (a commented-out COPY, " +
      "one in the wrong stage, or one with the wrong destination all count as missing). " +
      "pnpm cannot resolve the workspace graph without it, so `pnpm install --frozen-lockfile` " +
      "fails and the image does not build at all. This is very likely because you just ran " +
      "`pnpm gen app` or `pnpm gen package` — the generator does not (and cannot) edit the " +
      "Dockerfile for you. Add the following line(s) to the Dockerfile's `deps` stage:\n" +
      missing.map((rel) => `  ${copyLineFor(rel)}`).join("\n"),
  );
});
