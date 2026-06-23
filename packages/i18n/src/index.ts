/**
 * @repo/i18n — next-intl routing + locale-aware navigation FACTORIES.
 *
 * Owns the MECHANISM only. The APP owns POLICY (its locale list) and creates the
 * instances: `apps/web/i18n/routing.ts` (createRouting) +
 * `apps/web/i18n/navigation.ts` (createI18nNavigation, from the
 * `@repo/i18n/navigation` subpath). Strings live in `apps/web/messages/<locale>.json`.
 *
 * The old `routing` / `locales` / `defaultLocale` SINGLETONS are intentionally
 * gone: every consumer now resolves through its app-local i18n modules, so a
 * missed migration is a COMPILE error — not a silently dropped locale prefix.
 */
export { createRouting, type Routing } from "./routing";
