import type { PlopTypes } from "@turbo/gen";

/**
 * Turborepo scaffolding generators for shipwright.
 *
 * Run interactively from the repo root:
 *   pnpm gen package        # scaffold packages/<name>  (alias: add-package)
 *   pnpm gen app            # scaffold apps/<name>       (alias: add-app)
 *   pnpm gen react-component# scaffold a @repo/ui component
 *
 * Run head-lessly (scriptable, e.g. from a Claude skill) via Turbo's `--args`
 * flag — one positional per prompt, in order (NOT `-- name`, which Turbo rejects):
 *   pnpm gen package --args my-pkg
 *   pnpm gen app --args my-app 3200          # plain app
 *   pnpm gen app --args my-app 3200 true     # PWA app (installable + offline)
 *   pnpm gen react-component --args my-thing
 *
 * Each generated package/app is wired to the shared `@repo/*` config and passes
 * `pnpm install && pnpm check-types && lint && build` with zero manual edits.
 */

/** Reject anything that isn't lower-case kebab-case (the repo's package convention). */
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function validateKebab(input: unknown): true | string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "A name is required.";
  }
  const value = input.trim();
  if (!KEBAB_CASE.test(value)) {
    return `"${value}" must be kebab-case: lower-case letters/numbers separated by single hyphens (e.g. "payments", "rate-limit").`;
  }
  return true;
}

/** Coerce a plop confirm answer (interactive boolean OR `--args` string) to bool. */
function isTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === "y" || value === "yes";
}

// ---------------------------------------------------------------------------
// package — a TypeScript library package under packages/<name>, matching the
// conventions of @repo/env (exports map, shared tsconfig/eslint, tsc scripts).
// ---------------------------------------------------------------------------
const PACKAGE_PROMPTS: PlopTypes.PromptQuestion[] = [
  {
    type: "input",
    name: "name",
    message: "Package name (kebab-case, becomes @repo/<name>):",
    validate: validateKebab,
  },
];

const PACKAGE_ACTIONS: PlopTypes.ActionType[] = [
  {
    type: "add",
    path: "packages/{{ dashCase name }}/package.json",
    templateFile: "templates/package/package.json.hbs",
  },
  {
    type: "add",
    path: "packages/{{ dashCase name }}/tsconfig.json",
    templateFile: "templates/package/tsconfig.json.hbs",
  },
  {
    type: "add",
    path: "packages/{{ dashCase name }}/eslint.config.mjs",
    templateFile: "templates/package/eslint.config.mjs.hbs",
  },
  {
    type: "add",
    path: "packages/{{ dashCase name }}/src/index.ts",
    templateFile: "templates/package/src/index.ts.hbs",
  },
  "\nScaffolded packages/{{ dashCase name }} (@repo/{{ dashCase name }}). Run `pnpm install` to link it.",
];

// ---------------------------------------------------------------------------
// app — a Next.js 16 App-Router app under apps/<name>, wired to @repo/ui like
// apps/web. Defaults to dev port 3200 (web=3000, e2e=3100 are taken). With the
// `pwa` option it also scaffolds an installable + offline PWA.
// ---------------------------------------------------------------------------
const APP_PROMPTS: PlopTypes.PromptQuestion[] = [
  {
    type: "input",
    name: "name",
    message: "App name (kebab-case, the workspace + apps/<name> dir):",
    validate: validateKebab,
  },
  {
    type: "input",
    name: "port",
    message: "Dev port (web=3000, e2e=3100 are taken):",
    default: "3200",
    validate: (input: unknown) => {
      const value = String(input).trim();
      if (!/^\d{2,5}$/.test(value)) return "Port must be a number.";
      const n = Number(value);
      if (n < 1 || n > 65535) return "Port must be 1–65535.";
      return true;
    },
  },
  {
    type: "confirm",
    name: "pwa",
    message: "Make it a PWA (installable + offline)?",
    default: false,
  },
];

/** Base (non-PWA) app files. */
const APP_BASE_ACTIONS: PlopTypes.ActionType[] = [
  { type: "add", path: "apps/{{ dashCase name }}/package.json", templateFile: "templates/app/package.json.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/next.config.ts", templateFile: "templates/app/next.config.ts.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/tsconfig.json", templateFile: "templates/app/tsconfig.json.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/postcss.config.mjs", templateFile: "templates/app/postcss.config.mjs.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/eslint.config.js", templateFile: "templates/app/eslint.config.js.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/.gitignore", templateFile: "templates/app/_gitignore.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/app/layout.tsx", templateFile: "templates/app/app/layout.tsx.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/app/page.tsx", templateFile: "templates/app/app/page.tsx.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/app/globals.css", templateFile: "templates/app/app/globals.css.hbs" },
];

/** PWA-only files, appended when the `pwa` answer is truthy. */
const APP_PWA_ACTIONS: PlopTypes.ActionType[] = [
  { type: "add", path: "apps/{{ dashCase name }}/app/manifest.ts", templateFile: "templates/app/app/manifest.ts.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/public/sw.js", templateFile: "templates/app/public/sw.js.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/app/offline/page.tsx", templateFile: "templates/app/app/offline/page.tsx.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/app/icon.svg", templateFile: "templates/app/app/icon.svg.hbs" },
  { type: "add", path: "apps/{{ dashCase name }}/proxy.ts", templateFile: "templates/app/proxy.ts.hbs" },
];

/** App actions: base files + (PWA files when chosen) + a next-steps note. */
function appActions(data?: Record<string, unknown>): PlopTypes.ActionType[] {
  const pwa = isTruthy(data?.pwa) ? APP_PWA_ACTIONS : [];
  return [
    ...APP_BASE_ACTIONS,
    ...pwa,
    "\nScaffolded apps/{{ dashCase name }}. Run `pnpm install`, then `pnpm dev --filter={{ dashCase name }}` (port {{ port }}).",
  ];
}

// ---------------------------------------------------------------------------
// react-component — a typed @repo/ui component stub at
// packages/ui/src/components/ui/<name>.tsx (matching button.tsx / card.tsx).
// ---------------------------------------------------------------------------
const REACT_COMPONENT_ACTIONS: PlopTypes.ActionType[] = [
  {
    type: "add",
    path: "packages/ui/src/components/ui/{{ dashCase name }}.tsx",
    templateFile: "templates/react-component/component.tsx.hbs",
  },
  "\nScaffolded packages/ui/src/components/ui/{{ dashCase name }}.tsx. Import it as `@repo/ui/components/ui/{{ dashCase name }}`.",
];

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("package", {
    description: "Add a new @repo/* TypeScript package under packages/",
    prompts: PACKAGE_PROMPTS,
    actions: PACKAGE_ACTIONS,
  });
  plop.setGenerator("add-package", {
    description: "Alias for `package`.",
    prompts: PACKAGE_PROMPTS,
    actions: PACKAGE_ACTIONS,
  });

  plop.setGenerator("app", {
    description: "Add a new Next.js app under apps/, wired to @repo/ui (optionally a PWA)",
    prompts: APP_PROMPTS,
    actions: appActions,
  });
  plop.setGenerator("add-app", {
    description: "Alias for `app`.",
    prompts: APP_PROMPTS,
    actions: appActions,
  });

  plop.setGenerator("react-component", {
    description: "Add a typed React component to @repo/ui",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Component name (kebab-case file, e.g. badge, alert-dialog):",
        validate: validateKebab,
      },
    ],
    actions: REACT_COMPONENT_ACTIONS,
  });
}
