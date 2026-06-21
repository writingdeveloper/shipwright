import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Translation-drift guard. @repo/i18n owns the mechanism; the app owns the
 * strings (`apps/web/messages/*.json`). This test lives with the routing tests
 * (test-only reach into the app) so the en/ko files can't drift apart — a key
 * present in one locale but missing in another is an untranslated / runtime-
 * missing string. Add a locale here and this fails until its keys match.
 */
const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, "../../../apps/web/messages");

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
  it("en and ko have identical key sets (no translation drift)", () => {
    expect(keysOf(load("ko")).sort()).toEqual(keysOf(load("en")).sort());
  });
});
