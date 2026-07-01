"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "../../../i18n/navigation";
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

import { PasswordInput } from "../../../components/password-input";
import { SocialSignIn } from "../../../components/social-sign-in";

export function SignInForm() {
  const t = useTranslations("auth.signIn");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error } = await authClient.signIn.email({
      email,
      password,
    });

    setPending(false);

    if (error) {
      setError(error.message ?? t("invalidCredentials"));
      // Move focus back to the first field so the keyboard/SR user lands on
      // what to fix, not on the (now re-enabled) submit button.
      document.getElementById("email")?.focus();
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main id="main" className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle asChild>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            <SocialSignIn />
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
                aria-describedby={error ? "signin-error" : undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <Link
                  href="/forgot-password"
                  className="text-primary text-sm hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "signin-error" : undefined}
              />
            </div>
            {error ? (
              <p
                id="signin-error"
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
              {t("noAccount")}{" "}
              <Link href="/sign-up" className="text-primary hover:underline">
                {tNav("signUp")}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
