"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@repo/ui/components/ui/button";

import { openBillingPortal } from "./billing-actions";

/**
 * The "Manage billing" form: posts to the `openBillingPortal` Server Action,
 * which hands the browser off to Stripe's hosted Billing Portal (cancel /
 * payment method / invoices). Mirrors `UpgradeButton`: split out as a client
 * component only for the `useFormStatus` pending state, and rendered ONLY when
 * the user is Pro with a real Stripe customer (the parent gates it), so a
 * comped Pro or the keyless e2e never sees a dead-end button.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Opening…" : "Manage billing"}
    </Button>
  );
}

export function ManageBillingButton() {
  return (
    <form action={openBillingPortal}>
      <SubmitButton />
    </form>
  );
}
