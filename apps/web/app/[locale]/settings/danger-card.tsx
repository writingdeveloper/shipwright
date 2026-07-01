"use client";

import { useActionState, useState } from "react";
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
import { deleteAccount, type SettingsActionState } from "./account-actions";

const IDLE: SettingsActionState = { status: "idle" };

/**
 * Account deletion (GDPR). Two-step: an explicit reveal, then a
 * password-confirmed submit — the password (not a typed phrase) is the
 * security boundary, verified server-side by Better Auth before anything is
 * deleted. Social-only accounts set a password via forgot-password first.
 */
export function DangerCard() {
  const [state, formAction, pending] = useActionState(deleteAccount, IDLE);
  const [armed, setArmed] = useState(false);

  return (
    <Card data-testid="danger-card" className="border-destructive/50">
      <CardHeader>
        <CardTitle asChild>
          <h2>Delete account</h2>
        </CardTitle>
        <CardDescription>
          Permanently removes your account, tasks, files, push subscriptions,
          and cancels any active subscription. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {armed ? (
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-password">
                Confirm with your password
              </Label>
              <PasswordInput
                id="delete-password"
                name="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>
            {state.message ? (
              <p role="alert" className="text-destructive text-sm">
                {state.message}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="destructive"
                disabled={pending}
                aria-busy={pending}
              >
                {pending ? "Deleting…" : "Permanently delete my account"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setArmed(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setArmed(true)}
          >
            Delete account…
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
