import { defineRouting } from "next-intl/routing";

/**
 * i18n routing config — the single source of truth for which locales exist.
 *
 * `localePrefix: "as-needed"` keeps the DEFAULT locale (`en`) prefix-free — `/`
 * and `/sign-in` stay exactly as they were — while other locales are prefixed
 * (`/ko/...`). So adding i18n leaves existing URLs, internal links, and the e2e
 * untouched, and SEO still gets per-language URLs + hreflang.
 *
 * GRACEFUL: set `locales` to a single entry (`["en"]`) and i18n becomes a
 * single-language no-op — no `/xx` routes, the LocaleSwitcher hides itself.
 * Adding `"ko"` here is the demo of how to grow to N languages.
 */
export const routing = defineRouting({
  locales: ["en", "ko"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
