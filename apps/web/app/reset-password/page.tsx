"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

import { PasswordInput } from "../../components/password-input";

export default function ResetPasswordPage() {
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
      setError(
        error.message ?? "Couldn't reset your password. Try the link again.",
      );
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
            <h1>Set a new password</h1>
          </CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        {!token ? (
          <CardContent>
            <p className="text-destructive text-sm" role="alert">
              This reset link is invalid or has expired.{" "}
              <Link
                href="/forgot-password"
                className="text-primary hover:underline"
              >
                Request a new one
              </Link>
              .
            </p>
          </CardContent>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">New password</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
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
                {pending ? "Saving…" : "Reset password"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
