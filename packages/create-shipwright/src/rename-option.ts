/**
 * Helpers for the post-scaffold rename step.
 *
 * The rename tool itself ships IN the template (`scripts/rename.mjs`), so the
 * CLI never duplicates its rewrite logic — it only collects a display name
 * (prompt or `--name`) and shells out to the scaffolded project's own script.
 * These helpers are pure so they can be unit-tested without running the CLI.
 */

/** "my-cool-app" -> "My Cool App" — the prompt's suggested display name. */
export function titleCaseFromDir(dirBasename: string): string {
  return dirBasename
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Mirror `scripts/rename.mjs`'s input rules so a bad name fails HERE, before
 * any download, instead of mid-scaffold. Returns an error message or null.
 */
export function validateAppName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "App name must not be empty.";
  if (/["`\\$\n\r]/.test(trimmed)) {
    return "App name must not contain quotes, backticks, backslashes, or dollar signs.";
  }
  return null;
}
