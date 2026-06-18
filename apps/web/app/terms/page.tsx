import type { Metadata } from "next";
import Link from "next/link";
import { createMetadata } from "@repo/seo";
import { TermsOfService } from "@repo/legal";
import { Button } from "@repo/ui/components/ui/button";

import { legalConfig, seoSite } from "../../lib/site";

export const metadata: Metadata = createMetadata(seoSite, {
  title: "Terms of Service",
  description: `The terms governing your use of ${legalConfig.appName}.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="bg-background flex min-h-svh justify-center p-6">
      <div className="w-full max-w-2xl py-10">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link href="/">← Back home</Link>
        </Button>
        <TermsOfService config={legalConfig} />
      </div>
    </main>
  );
}
