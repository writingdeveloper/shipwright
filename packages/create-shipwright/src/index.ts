#!/usr/bin/env node
/**
 * create-shipwright — scaffold a new project from the shipwright starter.
 *
 *   npx create-shipwright my-app
 *
 * It downloads the `writingdeveloper/shipwright` GitHub repo (via giget's
 * degit-style tarball fetch — no full git history), drops it into a new
 * directory, and optionally runs `git init` + installs dependencies.
 *
 * Design goals: tiny, dependency-light (giget + prompts + picocolors), and
 * non-destructive — `--dry-run` resolves the plan and prints it WITHOUT touching
 * the network or the filesystem, and an existing non-empty target is refused
 * unless `--force`.
 */
import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { downloadTemplate } from "giget";
import pc from "picocolors";
import prompts from "prompts";

// Bumped by the build from package.json is overkill; keep a single source here.
const CLI_NAME = "create-shipwright";

/** GitHub repo the starter lives in (giget shorthand → tarball download). */
const DEFAULT_REPO = "github:writingdeveloper/shipwright";
const DEFAULT_REF = "main";

/**
 * Optional, removable features (each maps to a `@repo/<key>` package). CORE
 * packages (ui, auth, db, env, config) are always included and not listed here.
 *
 * `--features` / the interactive multiselect choose which OPTIONAL ones you'll
 * use; the rest are "dropped" and the CLI points at `docs/REMOVING-FEATURES.md`
 * to strip them. The scaffold ALWAYS ships every feature (so it builds as-is) —
 * nothing is auto-removed, because each integration already no-ops without its
 * env keys and several share code that a blind delete would break.
 */
const OPTIONAL_FEATURES = [
  { key: "analytics", title: "Analytics", hint: "PostHog + GA4" },
  { key: "observability", title: "Observability", hint: "Sentry + logger" },
  { key: "payments", title: "Payments", hint: "Stripe billing" },
  { key: "email", title: "Email", hint: "Resend transactional email" },
  { key: "security", title: "Rate limiting", hint: "Upstash / in-memory" },
  { key: "seo", title: "SEO", hint: "metadata + sitemap + JSON-LD" },
  { key: "legal", title: "Legal", hint: "cookie consent + policies" },
  { key: "pwa", title: "PWA", hint: "manifest + service worker + push" },
  { key: "storage", title: "File storage", hint: "S3-compatible uploads" },
  { key: "i18n", title: "i18n", hint: "next-intl locale routing" },
  { key: "api", title: "tRPC API", hint: "opt-in tRPC, alongside Server Actions" },
] as const;

/** Just the keys, widened to `string[]` so `.includes(arbitraryString)` type-checks. */
const FEATURE_KEYS: readonly string[] = OPTIONAL_FEATURES.map((f) => f.key);

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

interface Options {
  /** Target directory (positional arg). */
  dir?: string;
  /** giget source or a local path/`file:` dir. Defaults to DEFAULT_REPO. */
  template: string;
  /** Git ref (branch/tag) for the default repo; ignored for local templates. */
  ref: string;
  git: boolean;
  install: boolean;
  packageManager?: PackageManager;
  force: boolean;
  dryRun: boolean;
  /** Optional features to KEEP ("all" or a subset). undefined ⇒ resolve later
   *  (prompt when interactive, else keep all). */
  features?: readonly string[] | "all";
}

const HELP = `
${pc.bold("create-shipwright")} — scaffold a project from the shipwright starter

${pc.bold("Usage")}
  npx create-shipwright ${pc.dim("[directory] [options]")}

${pc.bold("Arguments")}
  directory               Where to create the project (prompted if omitted)

${pc.bold("Options")}
  --template <source>     giget source or a local dir to copy from
                          ${pc.dim(`(default: ${DEFAULT_REPO})`)}
  --ref <branch|tag>      Git ref of the default repo ${pc.dim(`(default: ${DEFAULT_REF})`)}
  --pm <pnpm|npm|yarn|bun>  Package manager for install ${pc.dim("(default: pnpm)")}
  --no-git                Do not run ${pc.dim("git init")}
  --no-install            Do not install dependencies
  --force                 Allow scaffolding into a non-empty directory
  --features <list|all>   Optional features you'll use ${pc.dim("(default: prompt / all)")}
                          ${pc.dim(`comma-list of: ${FEATURE_KEYS.join(", ")}`)}
                          ${pc.dim("dropped features stay in the scaffold; see docs/REMOVING-FEATURES.md")}
  --dry-run               Resolve and print the plan; download/write NOTHING
  -h, --help              Show this help
  -v, --version           Show the version

${pc.bold("Examples")}
  npx create-shipwright my-app
  npx create-shipwright my-app --ref v0.2.0 --pm npm
  npx create-shipwright my-app --no-install --no-git
  npx create-shipwright my-app --features payments,email
  npx create-shipwright my-app --template ./local/checkout --dry-run
`;

function readVersion(): string {
  // The built entry is <pkg>/dist/index.js, so package.json is one level up.
  // fileURLToPath handles Windows paths correctly (no leading-slash bug).
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Minimal hand-rolled flag parser (no dependency, predictable behaviour). */
function parseArgs(argv: string[]): {
  options: Options;
  showHelp: boolean;
  showVersion: boolean;
  error?: string;
} {
  const options: Options = {
    template: DEFAULT_REPO,
    ref: DEFAULT_REF,
    git: true,
    install: true,
    force: false,
    dryRun: false,
  };
  let showHelp = false;
  let showVersion = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // `noUncheckedIndexedAccess` types this as possibly undefined; the loop
    // bound guarantees it isn't, but narrow explicitly to keep the body typed.
    if (arg === undefined) continue;
    switch (arg) {
      case "-h":
      case "--help":
        showHelp = true;
        break;
      case "-v":
      case "--version":
        showVersion = true;
        break;
      case "--no-git":
        options.git = false;
        break;
      case "--no-install":
        options.install = false;
        break;
      case "--force":
        options.force = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--template":
        options.template = argv[++i] ?? "";
        if (!options.template) return { options, showHelp, showVersion, error: "--template needs a value" };
        break;
      case "--ref":
        options.ref = argv[++i] ?? "";
        if (!options.ref) return { options, showHelp, showVersion, error: "--ref needs a value" };
        break;
      case "--pm": {
        const value = argv[++i];
        if (value !== "pnpm" && value !== "npm" && value !== "yarn" && value !== "bun") {
          return { options, showHelp, showVersion, error: `--pm must be one of pnpm|npm|yarn|bun (got "${value ?? ""}")` };
        }
        options.packageManager = value;
        break;
      }
      case "--features": {
        const value = argv[++i] ?? "";
        if (!value) return { options, showHelp, showVersion, error: "--features needs a value (a comma-list or 'all')" };
        if (value === "all") {
          options.features = "all";
        } else {
          const keys = value.split(",").map((s) => s.trim()).filter(Boolean);
          const unknown = keys.filter((k) => !FEATURE_KEYS.includes(k));
          if (unknown.length) {
            return { options, showHelp, showVersion, error: `--features: unknown feature(s) ${unknown.join(", ")}. Valid: ${FEATURE_KEYS.join(", ")}` };
          }
          options.features = keys;
        }
        break;
      }
      default:
        if (arg.startsWith("-")) {
          return { options, showHelp, showVersion, error: `Unknown option: ${arg}` };
        }
        // First positional is the target directory.
        if (options.dir === undefined) options.dir = arg;
        break;
    }
  }

  return { options, showHelp, showVersion };
}

/** A local template is an existing directory or an explicit `file:` source. */
function resolveLocalTemplate(template: string): string | null {
  let candidate: string | null = null;
  if (template.startsWith("file:")) candidate = template.slice("file:".length);
  else if (template === "." || template.startsWith("./") || template.startsWith("../") || path.isAbsolute(template)) {
    candidate = template;
  }
  if (!candidate) return null;
  const abs = path.resolve(candidate);
  return existsSync(abs) ? abs : null;
}

/** True when the directory does not exist or is empty (ignoring .git). */
async function isDirEmpty(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return true;
  const entries = await readdir(dir);
  return entries.filter((e) => e !== ".git").length === 0;
}

function detectPackageManager(explicit?: PackageManager): PackageManager {
  if (explicit) return explicit;
  // npm/pnpm/yarn/bun set this when running the CLI (e.g. via `npm create`); it
  // is a RUNTIME detection hint, not a build input, so it is intentionally not a
  // turbo globalEnv (which would pollute every task's cache key).
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("npm")) return "npm";
  if (ua.startsWith("bun")) return "bun";
  return "pnpm";
}

function run(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

async function copyLocalTemplate(from: string, to: string): Promise<void> {
  // Copy everything except the things that must never be cloned into a fresh
  // project (deps, build output, local DB, env, VCS, the consumer's own dist).
  const SKIP = new Set([
    "node_modules",
    ".next",
    ".turbo",
    "dist",
    ".git",
    "coverage",
    "playwright-report",
    "test-results",
  ]);
  await mkdir(to, { recursive: true });
  await cp(from, to, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (SKIP.has(base)) return false;
      // Drop real env files (.env, .env.local, .env.production, …) but KEEP the
      // committed templates (.env.example / .env.sample) — the fresh project's
      // very first onboarding step is `cp apps/web/.env.example apps/web/.env`,
      // so excluding them (they also match `.env.*`) would break setup.
      const isEnvTemplate = base === ".env.example" || base === ".env.sample";
      if (!isEnvTemplate && (base === ".env" || base.startsWith(".env."))) {
        return false;
      }
      if (base.endsWith(".db") || base.includes(".db-")) return false;
      return true;
    },
  });
}

function banner(version: string): void {
  console.log();
  console.log(`${pc.cyan(pc.bold("create-shipwright"))} ${pc.dim(`v${version}`)}`);
}

async function main(): Promise<number> {
  const version = readVersion();
  const { options, showHelp, showVersion, error } = parseArgs(process.argv.slice(2));

  if (showVersion) {
    console.log(version);
    return 0;
  }
  if (showHelp) {
    console.log(HELP);
    return 0;
  }
  if (error) {
    console.error(`${pc.red("error")} ${error}`);
    console.log(`\nRun ${pc.cyan(`${CLI_NAME} --help`)} for usage.`);
    return 1;
  }

  banner(version);

  // 1. Resolve the target directory (prompt if not given, non-interactive-safe).
  let dir = options.dir;
  if (!dir) {
    if (!process.stdout.isTTY) {
      console.error(`${pc.red("error")} no target directory given (non-interactive). Pass one: ${pc.cyan(`${CLI_NAME} my-app`)}`);
      return 1;
    }
    const answer = await prompts({
      type: "text",
      name: "dir",
      message: "Project directory?",
      initial: "my-shipwright-app",
    });
    dir = typeof answer.dir === "string" ? answer.dir.trim() : undefined;
    if (!dir) {
      console.log(pc.yellow("Aborted."));
      return 1;
    }
  }

  // 1b. Resolve which OPTIONAL features to keep. Interactive + no flag → multiselect
  // (all preselected; unselect to drop). Non-interactive + no flag → keep all
  // (today's behavior, zero regression). Dropped features are NOT removed from the
  // scaffold — the CLI just surfaces their removal guide.
  let kept: Set<string>;
  if (Array.isArray(options.features)) {
    kept = new Set(options.features);
  } else if (options.features === undefined && process.stdout.isTTY && !options.dryRun) {
    const answer = await prompts({
      type: "multiselect",
      name: "features",
      message: "Optional features to include",
      instructions: false,
      hint: "space toggles · enter confirms · all preselected",
      choices: OPTIONAL_FEATURES.map((f) => ({
        title: `${f.title} ${pc.dim(`— ${f.hint}`)}`,
        value: f.key,
        selected: true,
      })),
    });
    kept = Array.isArray(answer.features)
      ? new Set(answer.features)
      : new Set(FEATURE_KEYS);
  } else {
    // "all", or the non-interactive default.
    kept = new Set(FEATURE_KEYS);
  }
  const dropped = OPTIONAL_FEATURES.filter((f) => !kept.has(f.key));

  const targetDir = path.resolve(process.cwd(), dir);
  const projectName = path.basename(targetDir);
  const localTemplate = resolveLocalTemplate(options.template);
  const source = localTemplate
    ? `local:${localTemplate}`
    : options.template === DEFAULT_REPO
      ? `${DEFAULT_REPO}#${options.ref}`
      : options.template;
  const pm = detectPackageManager(options.packageManager);

  // 2. Refuse a non-empty target unless --force.
  const empty = await isDirEmpty(targetDir);
  if (!empty && !options.force) {
    console.error(`\n${pc.red("error")} ${pc.bold(targetDir)} already exists and is not empty.`);
    console.log(`Use ${pc.cyan("--force")} to scaffold into it anyway.`);
    return 1;
  }

  // 3. Print the plan. In --dry-run this is the whole job (no I/O after this).
  console.log();
  console.log(pc.bold("Plan"));
  console.log(`  ${pc.dim("name      ")} ${projectName}`);
  console.log(`  ${pc.dim("directory ")} ${targetDir}`);
  console.log(`  ${pc.dim("template  ")} ${source}`);
  console.log(`  ${pc.dim("git init  ")} ${options.git ? pc.green("yes") : pc.dim("no")}`);
  console.log(`  ${pc.dim("install   ")} ${options.install ? `${pc.green("yes")} ${pc.dim(`(${pm})`)}` : pc.dim("no")}`);
  if (!empty) console.log(`  ${pc.dim("force     ")} ${pc.yellow("yes (target not empty)")}`);
  console.log(
    `  ${pc.dim("features  ")} ${
      dropped.length === 0
        ? `${pc.green("all")} ${pc.dim(`(${FEATURE_KEYS.length})`)}`
        : `${[...kept].join(", ") || pc.dim("core only")} ${pc.dim(`· dropping ${dropped.length}`)}`
    }`,
  );

  if (dropped.length) {
    console.log();
    console.log(pc.bold("Dropped features"));
    console.log(pc.dim("  The scaffold still includes every feature, so it builds as-is. Remove the"));
    console.log(`  ${pc.dim("ones below by following")} ${pc.cyan("docs/REMOVING-FEATURES.md")}${pc.dim(":")}`);
    for (const f of dropped) {
      console.log(`    ${pc.yellow("-")} ${f.title} ${pc.dim(`(@repo/${f.key} — ${f.hint})`)}`);
    }
  }

  if (options.dryRun) {
    console.log(`\n${pc.cyan("dry-run")} — resolved the plan above; nothing was downloaded or written.`);
    return 0;
  }

  // 4. Fetch the template.
  console.log();
  try {
    if (localTemplate) {
      console.log(`${pc.dim("›")} Copying from ${pc.bold(localTemplate)} …`);
      await copyLocalTemplate(localTemplate, targetDir);
    } else {
      console.log(`${pc.dim("›")} Downloading ${pc.bold(source)} …`);
      await downloadTemplate(source, {
        dir: targetDir,
        force: options.force,
        // We run install ourselves below so we can honour --pm and --no-install.
        install: false,
      });
    }
  } catch (err) {
    console.error(`\n${pc.red("error")} failed to fetch the template: ${(err as Error).message}`);
    return 1;
  }

  // 5. Optional git init.
  if (options.git) {
    console.log(`${pc.dim("›")} Initialising git …`);
    const ok =
      run("git", ["init", "-q"], targetDir) &&
      run("git", ["add", "-A"], targetDir) &&
      run("git", ["commit", "-q", "-m", "Initial commit from create-shipwright"], targetDir);
    if (!ok) console.log(`  ${pc.yellow("warn")} git init/commit skipped (git not available or already a repo).`);
  }

  // 6. Optional dependency install.
  if (options.install) {
    console.log(`${pc.dim("›")} Installing dependencies with ${pc.bold(pm)} …`);
    const ok = run(pm, ["install"], targetDir);
    if (!ok) console.log(`  ${pc.yellow("warn")} install failed — run it yourself in ${projectName}.`);
  }

  // 7. Next steps.
  console.log();
  console.log(pc.green(pc.bold("Done!")), "Your shipwright project is ready.\n");
  console.log("Next steps:");
  console.log(`  ${pc.cyan(`cd ${dir}`)}`);
  if (!options.install) console.log(`  ${pc.cyan(`${pm} install`)}`);
  console.log(`  ${pc.cyan("cp apps/web/.env.example apps/web/.env")} ${pc.dim("# then fill in BETTER_AUTH_SECRET")}`);
  console.log(`  ${pc.cyan(`${pm} dev`)}`);
  console.log(`\nDeploy guide: ${pc.dim("DEPLOY.md")}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${pc.red("fatal")} ${(err as Error).stack ?? String(err)}`);
    process.exit(1);
  });
