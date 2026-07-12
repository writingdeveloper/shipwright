import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name: string) =>
  JSON.parse(readFileSync(join(packageRoot, name), "utf8"));

/**
 * The shadcn CLI rewrites imports to the aliases in components.json — but it never
 * imports an alias bare. It always appends a component/file name underneath it
 * (`@repo/ui/hooks` -> `@repo/ui/hooks/use-mobile`; `@repo/ui/components/ui` ->
 * `@repo/ui/components/ui/button`), so an alias's `exports` entry only proves itself
 * when something one segment deeper also resolves through it. If it doesn't, the
 * generated component compiles fine in isolation and then explodes at *import time*
 * with ERR_PACKAGE_PATH_NOT_EXPORTED. `shadcn add sidebar` hit exactly this: it pulls
 * `use-mobile` into the hooks alias.
 *
 * This is asserted with `import.meta.resolve`, Node's own ESM resolver, instead of
 * hand-matching against the `exports` map ourselves. `resolve()` consults the real
 * exports map and throws ERR_PACKAGE_PATH_NOT_EXPORTED for exactly the subpaths it
 * doesn't cover (it does not require the probed file to exist), so it is the actual
 * contract — not an approximation of it that a differently-shaped `exports` entry
 * (e.g. an exact key instead of a wildcard) could talk its way past.
 */
describe("package contract", () => {
  it("resolves every components.json alias one segment deeper, the way shadcn imports it", () => {
    const components = readJson("components.json") as {
      aliases: Record<string, string>;
    };
    const { name } = readJson("package.json") as { name: string };

    const failures: string[] = [];
    for (const [key, alias] of Object.entries(components.aliases)) {
      if (!alias.startsWith(name)) continue;
      const probe = `${alias}/__resolve_probe__`;
      try {
        import.meta.resolve(probe);
      } catch {
        failures.push(`${key} -> "${alias}" has no exports entry covering "${probe}"`);
      }
    }

    expect(
      failures,
      "shadcn rewrites imports to these aliases one segment deeper than the alias " +
        "itself; an alias whose exports entry doesn't cover that depth compiles fine " +
        "and then explodes at import time with ERR_PACKAGE_PATH_NOT_EXPORTED",
    ).toEqual([]);
  });
});
