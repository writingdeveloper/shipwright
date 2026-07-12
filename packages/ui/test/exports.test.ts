import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name: string) =>
  JSON.parse(readFileSync(join(packageRoot, name), "utf8"));

/**
 * The shadcn CLI rewrites imports to the aliases in components.json — but not
 * uniformly one shape. Most aliases point at a directory, and shadcn always
 * appends a component/file name underneath it (`@repo/ui/hooks` ->
 * `@repo/ui/hooks/use-mobile`; `@repo/ui/components/ui` ->
 * `@repo/ui/components/ui/button`). But `utils` points directly at a single file
 * (`@repo/ui/lib/utils`) and is imported **bare**, with no segment appended. So an
 * alias's `exports` entry only proves itself when probed in the shape it is
 * actually used: a directory alias needs to resolve one segment deeper; a leaf-file
 * alias needs to resolve bare. Checking only one shape for every alias (as this test
 * used to) misses the other's regressions — a bare-only alias whose deeper form
 * happens to also resolve is not proof it's imported that way, and a deeper-only
 * alias would falsely "pass" a bare-only check that was never testing the real
 * shape. If a match doesn't resolve in the shape it needs, the generated component
 * compiles fine in isolation and then explodes at *import time* with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. `shadcn add sidebar` hit exactly this: it pulls
 * `use-mobile` into the hooks alias.
 *
 * This is asserted with `import.meta.resolve`, Node's own ESM resolver, instead of
 * hand-matching against the `exports` map ourselves. `resolve()` consults the real
 * exports map and throws ERR_PACKAGE_PATH_NOT_EXPORTED for exactly the subpaths it
 * doesn't cover (it does not require the probed file to exist), so it is the actual
 * contract — not an approximation of it that a differently-shaped `exports` entry
 * (e.g. an exact key instead of a wildcard) could talk its way past. An alias is
 * considered healthy if EITHER shape resolves: that models the real contract
 * (every alias must be importable in at least the one way it's actually used)
 * without hardcoding, per alias, which shape that is.
 */
describe("package contract", () => {
  it("resolves every components.json alias bare or one segment deeper, the way shadcn imports it", () => {
    const components = readJson("components.json") as {
      aliases: Record<string, string>;
    };
    const { name } = readJson("package.json") as { name: string };

    const resolves = (specifier: string): boolean => {
      try {
        import.meta.resolve(specifier);
        return true;
      } catch {
        return false;
      }
    };

    const failures: string[] = [];
    for (const [key, alias] of Object.entries(components.aliases)) {
      if (!alias.startsWith(name)) continue;
      const bareOk = resolves(alias);
      const deeperOk = resolves(`${alias}/__resolve_probe__`);
      if (!bareOk && !deeperOk) {
        failures.push(
          `${key} -> "${alias}" has no exports entry covering it bare OR one segment deeper`,
        );
      }
    }

    expect(
      failures,
      "shadcn imports some aliases bare (`utils` -> `@repo/ui/lib/utils`) and others one " +
        "segment deeper (`hooks` -> `@repo/ui/hooks/use-mobile`); an alias whose exports " +
        "entry covers NEITHER shape compiles fine in isolation and then explodes at import " +
        "time with ERR_PACKAGE_PATH_NOT_EXPORTED",
    ).toEqual([]);
  });
});
