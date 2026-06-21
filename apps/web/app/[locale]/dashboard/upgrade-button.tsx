"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@repo/ui/components/ui/button";

import { startCheckout } from "./billing-actions";

/**
 * The submit button inside the upgrade form. Split into its own client
 * component so it can use `useFormStatus` to show a pending state while the
 * `startCheckout` Server Action runs and the browser is handed off to Stripe's
 * hosted Checkout. Rendered ONLY when billing is configured (the parent gates
 * it), so the keyless e2e never sees — or clicks — it.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Redirecting…" : "Upgrade to Pro"}
    </Button>
  );
}

/** The upgrade form: posts to the `startCheckout` Server Action. */
export function UpgradeButton() {
  return (
    <form action={startCheckout}>
      <SubmitButton />
    </form>
  );
}
