import { notFound } from "next/navigation";

/**
 * Catch-all under a locale → the localized not-found, rendered THROUGH the
 * `[locale]` layout.
 *
 * Without this, a path like `/ko/nope` matches no route and Next serves its
 * built-in 404 — which renders OUTSIDE `[locale]/layout.tsx`, so it never runs
 * `await connection()` and never receives the per-request CSP nonce from
 * `proxy.ts`. The strict nonce CSP then blocks every one of that page's scripts
 * and inline styles (a wall of console violations), and the user sees Next's
 * bare default 404 instead of the app's localized `not-found.tsx`.
 *
 * A catch-all page that just calls `notFound()` makes every unmatched in-locale
 * path render through the layout (nonce injected) and trip the `not-found`
 * boundary → `[locale]/not-found.tsx`. Real routes are more specific than
 * `[...rest]`, so they still win; only genuinely-unknown paths land here.
 */
export default function CatchAllNotFound(): never {
  notFound();
}
