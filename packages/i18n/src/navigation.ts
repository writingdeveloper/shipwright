import { createNavigation } from "next-intl/navigation";

/**
 * Factory for locale-aware navigation APIs — `Link` / `redirect` / `usePathname`
 * / `useRouter` / `getPathname`, bound to the app's routing instance.
 *
 * The APP calls this from `apps/web/i18n/navigation.ts` with its own `routing`,
 * and app code imports the resulting helpers from there. Use THESE (not the
 * `next/*` originals) for internal links and redirects so the active locale (e.g.
 * `/ko`) is preserved across navigation — the plain ones silently drop it.
 */
export const createI18nNavigation = createNavigation;
