import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, breadcrumbJsonLd, createMetadata, JsonLd } from "@repo/seo";
import { PrivacyPolicy } from "@repo/legal";
import { Button } from "@repo/ui/components/ui/button";

import { legalConfig, seoSite, SITE_URL } from "../../lib/site";

export const metadata: Metadata = createMetadata(seoSite, {
  title: "Privacy Policy",
  description: `How ${legalConfig.appName} collects, uses, and protects your personal data.`,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <main id="main" className="bg-background flex min-h-svh justify-center p-6">
      <div className="w-full max-w-2xl py-10">
        {/* Breadcrumb structured data — a JSON data block (not executable, so the
            strict CSP allows it) that lets search/AI engines show the page's
            place in the site hierarchy. Demonstrates @repo/seo's breadcrumbJsonLd. */}
        <JsonLd
          data={breadcrumbJsonLd([
            { name: "Home", url: absoluteUrl(SITE_URL, "/") },
            { name: "Privacy Policy", url: absoluteUrl(SITE_URL, "/privacy") },
          ])}
        />
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link href="/">← Back home</Link>
        </Button>
        <PrivacyPolicy config={legalConfig} />
      </div>
    </main>
  );
}
