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
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";

import { updateName, type SettingsActionState } from "./account-actions";

const IDLE: SettingsActionState = { status: "idle" };

/** Display-name form. Inline success/error via `useActionState`. */
export function ProfileCard({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState(updateName, IDLE);

  return (
    <Card data-testid="profile-card">
      <CardHeader>
        <CardTitle asChild>
          <h2>Profile</h2>
        </CardTitle>
        <CardDescription>How you appear across the app.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              name="name"
              defaultValue={initialName}
              required
              maxLength={100}
              autoComplete="name"
              aria-describedby={state.message ? "profile-status" : undefined}
            />
          </div>
          {state.message ? (
            <p
              id="profile-status"
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
              {pending ? "Saving…" : "Save name"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
