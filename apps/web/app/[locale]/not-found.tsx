import { Link } from "../../i18n/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <main
      id="main"
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-3xl font-semibold tracking-tight">{t("code")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("message")}</p>
      <Button asChild>
        <Link href="/">{t("action")}</Link>
      </Button>
    </main>
  );
}
