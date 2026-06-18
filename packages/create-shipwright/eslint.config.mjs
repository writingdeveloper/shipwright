import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    // dist is build output; never lint it.
    ignores: ["dist/**"],
  },
];
