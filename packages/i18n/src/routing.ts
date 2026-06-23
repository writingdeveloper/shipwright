import { defineRouting } from "next-intl/routing";

/**
 * Factory for a next-intl routing config — the i18n MECHANISM.
 *
 * @repo/i18n owns the mechanism; the APP owns the locale POLICY and calls this
 * from `apps/web/i18n/routing.ts`. There is deliberately NO `routing` singleton
 * here: each app declares its own locales, and removing the singleton means a
 * consumer that forgets to migrate fails to COMPILE rather than silently dropping
 * the locale prefix.
 *
 * Pass `localePrefix: "as-needed"` for the starter convention — the default
 * locale is unprefixed (`/`, `/sign-in`) and other locales are prefixed
 * (`/ko/...`), so adding i18n leaves existing URLs + the e2e untouched while SEO
 * still gets per-language URLs + hreflang.
 */
export const createRouting = defineRouting;

/** The routing config shape returned by {@link createRouting}. */
export type Routing = ReturnType<typeof createRouting>;
