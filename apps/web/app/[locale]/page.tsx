import { getTranslations, setRequestLocale } from "next-intl/server";
import { type Locale, routing } from "@repo/i18n";
import { Link } from "@repo/i18n/navigation";
import { createMetadata } from "@repo/seo";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { LocaleSwitcher } from "../../components/locale-switcher";
import { seoSite } from "../../lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  await params;
  // hreflang for the home page: each locale's URL (default locale unprefixed).
  return createMetadata(seoSite, {
    path: "/",
    languages: Object.fromEntries(
      routing.locales.map((locale) => [
        locale,
        locale === routing.defaultLocale ? "/" : `/${locale}`,
      ]),
    ),
  });
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main
      id="main"
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6"
    >
      {/* Demo: the language switcher lives top-right on the home page. */}
      <div className="absolute right-4 top-4">
        <LocaleSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle asChild>
            <h1>Shipwright</h1>
          </CardTitle>
          <CardDescription>{t("home.tagline")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t("home.body")}</p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button asChild>
            <Link href="/sign-in">{t("nav.signIn")}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/sign-up">{t("nav.signUp")}</Link>
          </Button>
        </CardFooter>
      </Card>

      <footer className="text-muted-foreground flex items-center gap-4 text-sm">
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          {t("footer.privacy")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:text-foreground hover:underline">
          {t("footer.terms")}
        </Link>
      </footer>
    </main>
  );
}
