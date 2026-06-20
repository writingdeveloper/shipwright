import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, breadcrumbJsonLd, createMetadata, JsonLd } from "@repo/seo";
import { TermsOfService } from "@repo/legal";
import { Button } from "@repo/ui/components/ui/button";

import { legalConfig, seoSite, SITE_URL } from "../../lib/site";

export const metadata: Metadata = createMetadata(seoSite, {
  title: "Terms of Service",
  description: `The terms governing your use of ${legalConfig.appName}.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main id="main" className="bg-background flex min-h-svh justify-center p-6">
      <div className="w-full max-w-2xl py-10">
        {/* Breadcrumb structured data — a JSON data block (not executable, so the
            strict CSP allows it) that lets search/AI engines show the page's
            place in the site hierarchy. Demonstrates @repo/seo's breadcrumbJsonLd. */}
        <JsonLd
          data={breadcrumbJsonLd([
            { name: "Home", url: absoluteUrl(SITE_URL, "/") },
            { name: "Terms of Service", url: absoluteUrl(SITE_URL, "/terms") },
          ])}
        />
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link href="/">← Back home</Link>
        </Button>
        <TermsOfService config={legalConfig} />
      </div>
    </main>
  );
}
