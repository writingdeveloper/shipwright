import { describe, expect, it } from "vitest";

import {
  MAX_TITLE_LENGTH,
  normalizeTitle,
} from "../app/dashboard/validation";

/**
 * Unit tests for the pure task-title validation rule.
 *
 * `createTask` defers to `normalizeTitle` for all input validation, so testing
 * the helper here exercises the exact rule the Server Action enforces — without
 * needing `next/headers` or a request scope.
 */
describe("normalizeTitle", () => {
  it("accepts a normal title and trims surrounding whitespace", () => {
    expect(normalizeTitle("  Ship the feature  ")).toBe("Ship the feature");
  });

  it("rejects an empty string", () => {
    expect(normalizeTitle("")).toBeNull();
  });

  it("rejects a whitespace-only string", () => {
    expect(normalizeTitle("    ")).toBeNull();
    expect(normalizeTitle("\t\n  ")).toBeNull();
  });

  it("rejects non-string input (e.g. a missing form field)", () => {
    expect(normalizeTitle(null)).toBeNull();
    expect(normalizeTitle(undefined)).toBeNull();
    expect(normalizeTitle(42)).toBeNull();
    // A File (as FormData may yield) is not a string -> rejected.
    expect(normalizeTitle({})).toBeNull();
  });

  it(`accepts a title exactly ${MAX_TITLE_LENGTH} chars long`, () => {
    const exact = "x".repeat(MAX_TITLE_LENGTH);
    expect(normalizeTitle(exact)).toBe(exact);
  });

  it(`rejects a title longer than ${MAX_TITLE_LENGTH} chars`, () => {
    expect(normalizeTitle("x".repeat(MAX_TITLE_LENGTH + 1))).toBeNull();
  });

  it("measures length AFTER trimming (trailing spaces don't push it over)", () => {
    const padded = `${"x".repeat(MAX_TITLE_LENGTH)}     `;
    expect(normalizeTitle(padded)).toBe("x".repeat(MAX_TITLE_LENGTH));
  });
});
