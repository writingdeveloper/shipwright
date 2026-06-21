import { connection } from "next/server";
import { notFound } from "next/navigation";
import localFont from "next/font/local";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, defaultLocale, type Locale } from "@repo/i18n";
import { createMetadata, JsonLd, organizationJsonLd } from "@repo/seo";
import { CookieConsentBanner } from "@repo/legal/cookie-consent";
import { PostHogProvider } from "@repo/analytics/provider";
import { GoogleAnalytics } from "@repo/analytics/google-analytics";
import { ServiceWorkerProvider } from "@repo/pwa/register";
import "../globals.css";

import { LocaleSwitcher } from "../../components/locale-switcher";
import { seoSite, SITE_NAME, SITE_URL } from "../../lib/site";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  // Show fallback text immediately, swap in Geist when loaded (avoids FOIT / a
  // blank render-blocking flash); the fallback stack keeps layout stable (CLS).
  display: "swap",
  fallback: ["system-ui", "arial"],
});
const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

/** Hreflang alternates on every page's <head>. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  await params;
  return createMetadata(seoSite, {
    languages: Object.fromEntries(
      routing.locales.map((locale) => [
        locale,
        locale === defaultLocale ? "/" : `/${locale}`,
      ]),
    ),
  });
}

/** Pre-render the locale segment for each configured locale at build time. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // Reject unknown locales (e.g. /xx) with a 404 rather than rendering an
  // untranslated shell with a bogus <html lang>.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Make the locale available to server components (useTranslations etc.).
  setRequestLocale(locale);
  // Opt into dynamic rendering so the per-request CSP nonce minted in `proxy.ts`
  // is injected into Next's scripts/styles. Nonce-based CSP requires dynamic
  // rendering — see https://nextjs.org/docs/app/guides/content-security-policy.
  await connection();

  const t = await getTranslations({ locale, namespace: "layout" });

  // Locale-aware privacy page link: default locale is unprefixed.
  const privacyHref =
    locale === defaultLocale ? "/privacy" : `/${locale}/privacy`;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {/* Keyboard a11y: jump past chrome straight to the page's <main id="main">. */}
        <a
          href="#main"
          className="bg-background text-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
        >
          {t("skipToContent")}
        </a>
        {/* Registers the static service worker in production (no-op in dev). */}
        <ServiceWorkerProvider />
        {/* schema.org Organization structured data (a JSON data block, not an
            executable script, so the strict CSP allows it). */}
        <JsonLd data={organizationJsonLd({ name: SITE_NAME, url: SITE_URL })} />
        {/* NextIntlClientProvider exposes the active locale + messages to client
            components (useTranslations). Messages are supplied by the request
            config (i18n/request.ts), so no explicit prop is needed. */}
        <NextIntlClientProvider>
          {/* Site-wide locale switcher — fixed top-right on every page. MUST be
              inside the provider so its client useTranslations/useLocale have the
              i18n context (otherwise it throws during SSR). */}
          <div className="fixed right-4 top-4 z-40">
            <LocaleSwitcher />
          </div>
          {/* Consent-gated PostHog analytics (no-op without NEXT_PUBLIC_POSTHOG_KEY). */}
          <PostHogProvider>
            {/* Consent-gated GA4 (coexists with PostHog; no-op without NEXT_PUBLIC_GA_ID). */}
            <GoogleAnalytics />
            {children}
            {/* Opt-in cookie consent. Rendered by Next so the nonce CSP covers it. */}
            <CookieConsentBanner appName={SITE_NAME} privacyHref={privacyHref} />
          </PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
