"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
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
import { Label } from "@repo/ui/components/ui/label";

import { PasswordInput } from "../../../components/password-input";

export default function ResetPasswordPage() {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setPending(true);

    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    setPending(false);

    if (error) {
      setError(error.message ?? t("error"));
      return;
    }
    router.push("/sign-in");
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
        {!token ? (
          <CardContent>
            <p className="text-destructive text-sm" role="alert">
              {t("invalidLink")}{" "}
              <Link
                href="/forgot-password"
                className="text-primary hover:underline"
              >
                {t("requestNew")}
              </Link>
              .
            </p>
          </CardContent>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  placeholder={t("passwordPlaceholder")}
                  minLength={8}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "reset-error" : undefined}
                />
              </div>
              {error ? (
                <p
                  id="reset-error"
                  className="text-destructive text-sm"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="mt-6">
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t("submitLoading") : t("submit")}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
