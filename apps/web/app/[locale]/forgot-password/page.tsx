"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../i18n/navigation";
import { defaultLocale } from "../../../i18n/routing";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const origin = window.location.origin;
    const localePath = locale === defaultLocale ? "" : `/${locale}`;
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${origin}${localePath}/reset-password`,
    });

    setPending(false);

    if (error) {
      setError(error.message ?? t("error"));
      return;
    }
    setSent(true);
  }

  return (
    <main
      id="main"
      className="bg-background flex min-h-svh items-center justify-center p-6"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle asChild>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        {sent ? (
          <CardContent>
            <p className="text-sm" role="status">
              {t("success", { email })}
            </p>
          </CardContent>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "forgot-error" : undefined}
                />
              </div>
              {error ? (
                <p
                  id="forgot-error"
                  className="text-destructive text-sm"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="mt-6 flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t("submitLoading") : t("submit")}
              </Button>
              <p className="text-muted-foreground text-sm">
                {t("remembered")}{" "}
                <Link href="/sign-in" className="text-primary hover:underline">
                  {tNav("signIn")}
                </Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
