"use client";

import { type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { type Locale, routing } from "../i18n/routing";
import { usePathname, useRouter } from "../i18n/navigation";

/**
 * Language switcher: changes the locale while staying on the current page.
 * `usePathname` (from the app's `i18n/navigation`) is locale-stripped, and
 * `router.replace(pathname, { locale })` re-adds the chosen locale — so the user
 * lands on the same content in the new language. Renders nothing for a
 * single-locale app (graceful), mirroring how the other cards self-hide.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("locale");

  if (routing.locales.length < 2) return null;

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    router.replace(pathname, { locale: event.target.value as Locale });
  }

  return (
    <div>
      <label htmlFor="locale-switcher" className="sr-only">
        {t("label")}
      </label>
      <select
        id="locale-switcher"
        value={locale}
        onChange={onChange}
        className="border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm"
      >
        {routing.locales.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </select>
    </div>
  );
}
