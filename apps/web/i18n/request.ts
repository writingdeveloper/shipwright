import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Per-request i18n config — resolve the active locale (validated against the
 * routing config, falling back to the default) and load its messages. Wired via
 * `createNextIntlPlugin("./i18n/request.ts")` in `next.config.ts`. Messages are
 * app-owned content (`apps/web/messages/<locale>.json`); @repo/i18n owns only
 * the routing/navigation mechanism.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
