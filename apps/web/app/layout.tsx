import type { Metadata } from "next";
import { connection } from "next/server";
import localFont from "next/font/local";
import { createMetadata, JsonLd, organizationJsonLd } from "@repo/seo";
import { CookieConsentBanner } from "@repo/legal/cookie-consent";
import { PostHogProvider } from "@repo/analytics/provider";
import "./globals.css";

import { seoSite, SITE_NAME, SITE_URL } from "../lib/site";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

// Root metadata via @repo/seo: sets metadataBase (so canonical/OG/sitemap URLs
// resolve absolutely), a "%s · Shipwright" title template that per-page titles
// inherit, and the OpenGraph/Twitter defaults.
export const metadata: Metadata = createMetadata(seoSite);

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opt into dynamic rendering so the per-request CSP nonce minted in `proxy.ts`
  // is injected into Next's scripts/styles. Nonce-based CSP requires dynamic
  // rendering — a statically prerendered page is built before any request exists,
  // so it cannot carry that request's nonce, and `'strict-dynamic'` would then
  // block Next's own (un-nonced) bootstrap scripts. See
  // https://nextjs.org/docs/app/guides/content-security-policy.
  await connection();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {/* schema.org Organization structured data (a JSON data block, not an
            executable script, so the strict CSP allows it). */}
        <JsonLd
          data={organizationJsonLd({ name: SITE_NAME, url: SITE_URL })}
        />
        {/* Consent-gated PostHog analytics. With no NEXT_PUBLIC_POSTHOG_KEY this
            is a transparent pass-through (posthog-js never loads), so tests/CI
            and a fresh clone are unaffected; with a key it still initialises only
            after the user accepts cookies (via @repo/legal consent). */}
        <PostHogProvider>
          {children}
          {/* Opt-in cookie consent. Rendered by Next so the nonce CSP covers it;
              non-blocking by design (bottom strip, click-through wrapper) so it
              never intercepts the auth/task controls the e2e drives. */}
          <CookieConsentBanner appName={SITE_NAME} privacyHref="/privacy" />
        </PostHogProvider>
      </body>
    </html>
  );
}
