import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/ui`.
 *
 * Scope is the package's CONTRACT, not its React components: the aliases declared in
 * components.json must actually resolve through package.json's `exports`, or a
 * `shadcn add` that uses one produces an app that cannot import it.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
