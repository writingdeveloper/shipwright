import type { PlopTypes } from "@turbo/gen";

/**
 * Turborepo scaffolding generators for shipwright.
 *
 * Run interactively from the repo root:
 *   pnpm gen package        # scaffold packages/<name>  (alias: add-package)
 *   pnpm gen app            # scaffold apps/<name>       (alias: add-app)
 *   pnpm gen react-component# scaffold a @repo/ui component
 *
 * Run head-lessly (scriptable, e.g. from a Claude skill) by passing the prompt
 * answers as positional bypass args after `--`:
 *   pnpm gen package -- my-pkg
 *   pnpm gen app -- my-app
 *   pnpm gen react-component -- my-thing
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

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  // ---------------------------------------------------------------------------
  // package — a TypeScript library package under packages/<name>, matching the
  // conventions of @repo/env (exports map, shared tsconfig/eslint, tsc scripts).
  // ---------------------------------------------------------------------------
  plop.setGenerator("package", {
    description: "Add a new @repo/* TypeScript package under packages/",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Package name (kebab-case, becomes @repo/<name>):",
        validate: validateKebab,
      },
    ],
    actions: [
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
    ],
  });

  // alias
  plop.setGenerator("add-package", {
    description: "Alias for `package`.",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Package name (kebab-case, becomes @repo/<name>):",
        validate: validateKebab,
      },
    ],
    actions: [
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
    ],
  });

  // ---------------------------------------------------------------------------
  // app — a minimal Next.js 16 App-Router app under apps/<name>, wired to the
  // shared design system (@repo/ui) like apps/web. Defaults to dev port 3200 to
  // avoid colliding with web (3000) and the e2e harness (3100).
  // ---------------------------------------------------------------------------
  plop.setGenerator("app", {
    description: "Add a new Next.js app under apps/, wired to @repo/ui",
    prompts: [
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
    ],
    actions: [
      {
        type: "add",
        path: "apps/{{ dashCase name }}/package.json",
        templateFile: "templates/app/package.json.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/next.config.ts",
        templateFile: "templates/app/next.config.ts.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/tsconfig.json",
        templateFile: "templates/app/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/postcss.config.mjs",
        templateFile: "templates/app/postcss.config.mjs.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/eslint.config.js",
        templateFile: "templates/app/eslint.config.js.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/.gitignore",
        templateFile: "templates/app/_gitignore.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/app/layout.tsx",
        templateFile: "templates/app/app/layout.tsx.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/app/page.tsx",
        templateFile: "templates/app/app/page.tsx.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/app/globals.css",
        templateFile: "templates/app/app/globals.css.hbs",
      },
      "\nScaffolded apps/{{ dashCase name }}. Run `pnpm install`, then `pnpm dev --filter={{ dashCase name }}` (port {{ port }}).",
    ],
  });

  // alias
  plop.setGenerator("add-app", {
    description: "Alias for `app`.",
    prompts: [
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
    ],
    actions: [
      {
        type: "add",
        path: "apps/{{ dashCase name }}/package.json",
        templateFile: "templates/app/package.json.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/next.config.ts",
        templateFile: "templates/app/next.config.ts.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/tsconfig.json",
        templateFile: "templates/app/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/postcss.config.mjs",
        templateFile: "templates/app/postcss.config.mjs.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/eslint.config.js",
        templateFile: "templates/app/eslint.config.js.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/.gitignore",
        templateFile: "templates/app/_gitignore.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/app/layout.tsx",
        templateFile: "templates/app/app/layout.tsx.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/app/page.tsx",
        templateFile: "templates/app/app/page.tsx.hbs",
      },
      {
        type: "add",
        path: "apps/{{ dashCase name }}/app/globals.css",
        templateFile: "templates/app/app/globals.css.hbs",
      },
      "\nScaffolded apps/{{ dashCase name }}. Run `pnpm install`, then `pnpm dev --filter={{ dashCase name }}` (port {{ port }}).",
    ],
  });

  // ---------------------------------------------------------------------------
  // react-component — a typed @repo/ui component stub at
  // packages/ui/src/components/ui/<name>.tsx (matching button.tsx / card.tsx).
  // Wires up the existing `generate:component` script in @repo/ui.
  // ---------------------------------------------------------------------------
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
    actions: [
      {
        type: "add",
        path: "packages/ui/src/components/ui/{{ dashCase name }}.tsx",
        templateFile: "templates/react-component/component.tsx.hbs",
      },
      "\nScaffolded packages/ui/src/components/ui/{{ dashCase name }}.tsx. Import it as `@repo/ui/components/ui/{{ dashCase name }}`.",
    ],
  });
}
