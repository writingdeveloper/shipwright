/**
 * Pure, framework-free validation for task input.
 *
 * Extracted from the `createTask` Server Action so the rule can be unit-tested
 * without pulling in `next/headers` (which only works inside a request scope).
 * The action imports {@link normalizeTitle} and treats `null` as "reject".
 */

/** Maximum stored length of a task title (characters, after trimming). */
export const MAX_TITLE_LENGTH = 280;

/**
 * Normalize and validate a raw task-title input.
 *
 * Trims surrounding whitespace, then enforces the stored-title invariants:
 * non-empty and at most {@link MAX_TITLE_LENGTH} characters. Returns the
 * cleaned title when valid, or `null` when the input must be rejected
 * (non-string, empty, whitespace-only, or too long). This is the single source
 * of truth the Server Action defers to.
 */
export function normalizeTitle(raw: unknown): string | null {
  const title = typeof raw === "string" ? raw.trim() : "";

  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return null;
  }

  return title;
}
