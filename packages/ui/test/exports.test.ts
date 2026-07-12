import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name: string) =>
  JSON.parse(readFileSync(join(packageRoot, name), "utf8"));

/**
 * The shadcn CLI rewrites imports to the aliases in components.json. If an alias has
 * no matching entry in package.json's `exports`, the generated component compiles in
 * isolation and then explodes at import time with ERR_PACKAGE_PATH_NOT_EXPORTED.
 * `shadcn add sidebar` hits exactly this: it pulls `use-mobile` into the hooks alias.
 */
describe("package contract", () => {
  it("exports every subpath that components.json aliases point at", () => {
    const components = readJson("components.json") as {
      aliases: Record<string, string>;
    };
    const exports = readJson("package.json") as {
      name: string;
      exports: Record<string, string>;
    };

    // "@repo/ui/components/ui" -> "./components/*"; "@repo/ui/lib/utils" -> "./lib/*".
    const exported = Object.keys(exports.exports);
    const resolves = (alias: string) => {
      const subpath = alias.slice(exports.name.length); // "" | "/components/ui" | …
      if (subpath === "") return exported.includes(".");
      const [, head] = subpath.split("/"); // "components" | "lib" | "hooks"
      return exported.some(
        (key) => key === `./${head}/*` || key === `.${subpath}`,
      );
    };

    const unresolvable = Object.entries(components.aliases)
      .filter(([, alias]) => alias.startsWith(exports.name))
      .filter(([, alias]) => !resolves(alias))
      .map(([key, alias]) => `${key} -> ${alias}`);

    expect(unresolvable).toEqual([]);
  });
});
