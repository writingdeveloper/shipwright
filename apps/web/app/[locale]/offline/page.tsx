import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * Offline fallback shown by the service worker when a navigation fails with no
 * cached page. Kept static + dependency-light so it precaches cleanly.
 */
export default async function OfflinePage() {
  const t = await getTranslations("errors.offline");

  return (
    <main id="main" className="bg-background flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("message")}</p>
    </main>
  );
}
