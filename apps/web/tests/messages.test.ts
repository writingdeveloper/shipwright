import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { routing } from "../i18n/routing";

/**
 * Locale-config + translation-drift guard (app-owned).
 *
 * Locale POLICY lives in `../i18n/routing.ts`; the STRINGS live in
 * `../messages/<locale>.json`. This co-located test keeps the two in lockstep by
 * deriving the locale set from the messages dir (no hardcoded list) and
 * cross-checking it against `routing.locales`:
 *   1. every configured locale has a messages file, and vice-versa, and
 *   2. all locales share an identical key set (a key in one but not another is an
 *      untranslated / runtime-missing string).
 * Add a locale = add `i18n/routing.ts` + a `messages/<locale>.json`; this fails
 * until they agree.
 */
const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, "../messages");

const fileLocales = readdirSync(messagesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

function keysOf(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? keysOf(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"));
}

describe("messages", () => {
  it("the messages files exactly match the configured locales", () => {
    expect(fileLocales).toEqual([...routing.locales].sort());
  });

  it("every locale has an identical key set (no translation drift)", () => {
    expect(fileLocales.length).toBeGreaterThan(0);
    const [reference, ...rest] = fileLocales;
    const referenceKeys = keysOf(load(reference!)).sort();
    for (const locale of rest) {
      expect(keysOf(load(locale)).sort(), `${locale} vs ${reference}`).toEqual(
        referenceKeys,
      );
    }
  });
});
