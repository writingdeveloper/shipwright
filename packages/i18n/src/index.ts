/**
 * @repo/i18n — next-intl routing + locale-aware navigation for the starter.
 *
 * Owns the MECHANISM (routing config, navigation helpers). The app owns the
 * STRINGS (`apps/web/messages/<locale>.json`) and the request config that loads
 * them (`apps/web/i18n/request.ts`). Locale-aware navigation lives at the
 * `@repo/i18n/navigation` subpath (client/server `Link`/`redirect`/…).
 */
import { routing } from "./routing";

export { routing, type Locale } from "./routing";

/** Re-exports so consumers don't reach into `routing.locales` directly. */
export const locales = routing.locales;
export const defaultLocale = routing.defaultLocale;
