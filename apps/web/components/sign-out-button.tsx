"use client";

import { useState } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      onClick={onSignOut}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
