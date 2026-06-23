import { createI18nNavigation } from "@repo/i18n/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation for THIS app — drop-in replacements for `next/link` +
 * `next/navigation` that keep the active locale in the URL. Import these (NOT the
 * `next/*` originals) for internal links and redirects so `/ko` is preserved
 * across navigation (incl. the auth `redirect("/sign-in")` calls).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createI18nNavigation(routing);
