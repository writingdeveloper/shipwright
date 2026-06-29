import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import onlyWarn from "eslint-plugin-only-warn";

import ownerScopeRule from "./rules/no-unscoped-owner-table.js";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    plugins: {
      "owner-scope": { rules: { "no-unscoped-owner-table": ownerScopeRule } },
    },
    rules: {
      // Owner-table query without a scope helper. `only-warn` downgrades this to
      // a warning, but every package lints with `--max-warnings 0`, so it still
      // fails CI. Keep `tables` in sync with @repo/db OWNER_TABLES (+ the
      // in-repo `subscriptionTable` alias).
      "owner-scope/no-unscoped-owner-table": [
        "error",
        {
          tables: [
            "task",
            "uploadedFile",
            "pushSubscription",
            "subscription",
            "subscriptionTable",
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist/**"],
  },
];
