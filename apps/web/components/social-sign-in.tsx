"use client";

import { useState } from "react";
import { authClient } from "@repo/auth/client";
import { enabledSocialProviders } from "@repo/auth/config";
import { Button } from "@repo/ui/components/ui/button";

const LABELS: Record<"github" | "google", string> = {
  github: "GitHub",
  google: "Google",
};

/**
 * Social-login buttons + an "or" divider, shown only for providers whose public
 * clientId is set (`enabledSocialProviders`). Renders null when none are
 * configured, so the keyless app shows only the email/password form.
 */
export function SocialSignIn() {
  const providers = enabledSocialProviders();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (providers.length === 0) return null;

  async function signInWith(provider: "github" | "google") {
    setError(null);
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/dashboard",
    });
    // On success the browser is redirected, so we only reach here on error.
    setPending(false);
    if (error) {
      setError(error.message ?? `Couldn't sign in with ${LABELS[provider]}.`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {providers.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => signInWith(p)}
          >
            Continue with {LABELS[p]}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div
        className="text-muted-foreground flex items-center gap-3 text-xs"
        aria-hidden="true"
      >
        <span className="bg-border h-px flex-1" />
        or
        <span className="bg-border h-px flex-1" />
      </div>
    </div>
  );
}
