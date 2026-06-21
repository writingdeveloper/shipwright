import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation APIs — drop-in replacements for `next/link` +
 * `next/navigation` that keep the active locale in the URL. Use THESE (not the
 * `next/*` originals) for internal links and redirects so `/ko` is preserved
 * across navigation (incl. the auth `redirect("/sign-in")` calls).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
