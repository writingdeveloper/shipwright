"use client";

import { useActionState } from "react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";

import { PasswordInput } from "../../../components/password-input";
import { changePassword, type SettingsActionState } from "./account-actions";

const IDLE: SettingsActionState = { status: "idle" };

/**
 * Change-password form. Requires the current password; other sessions are
 * revoked server-side on success. Social-only accounts (no password yet) can
 * set one via the forgot-password flow first.
 *
 * `justChanged` is set by the page from `?changed=password` after the action
 * redirects (it rotates the session cookie, so it redirects rather than
 * returning inline state — see the action). Errors still render inline.
 */
export function PasswordCard({ justChanged = false }: { justChanged?: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, IDLE);

  return (
    <Card data-testid="password-card">
      <CardHeader>
        <CardTitle asChild>
          <h2>Password</h2>
        </CardTitle>
        <CardDescription>
          Changing your password signs you out everywhere else.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          {justChanged && state.status === "idle" ? (
            <p role="status" className="text-foreground text-sm">
              Password changed.
            </p>
          ) : state.message ? (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={
                state.status === "error"
                  ? "text-destructive text-sm"
                  : "text-foreground text-sm"
              }
            >
              {state.message}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Changing…" : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
