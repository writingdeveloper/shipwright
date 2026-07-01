"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../i18n/navigation";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/ui/button";

export function SignOutButton() {
  const t = useTranslations("auth.signOut");
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
      {pending ? t("loading") : t("label")}
    </Button>
  );
}
