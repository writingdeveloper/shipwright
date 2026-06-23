import { createRouting } from "@repo/i18n";

/**
 * This app's locale POLICY — the single source of truth for which locales exist.
 *
 * `localePrefix: "as-needed"` keeps the default locale (`en`) unprefixed (`/`,
 * `/sign-in`) and prefixes the rest (`/ko/...`), so existing URLs + the e2e stay
 * unchanged while SEO still gets per-language URLs + hreflang. Add a locale here
 * AND add a matching `apps/web/messages/<locale>.json`; `tests/messages.test.ts`
 * fails until their key sets match. Reduce `locales` to a single entry to make
 * i18n a single-language near-no-op (the LocaleSwitcher hides itself).
 */
export const routing = createRouting({
  locales: ["en", "ko"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/** Convenience re-exports so consumers don't reach into `routing.*` directly. */
export const { locales, defaultLocale } = routing;
