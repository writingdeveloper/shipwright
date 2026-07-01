import { isBillingConfigured } from "@repo/payments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { ManageBillingButton } from "./manage-billing-button";
import { UpgradeButton } from "./upgrade-button";

/**
 * Billing card. `pro` and `hasBillingAccount` are passed down from the page
 * (which already loads the subscription once for the header Pro badge —
 * avoiding a duplicate query); `billingConfigured` is read here. `checkout`
 * surfaces the Stripe redirect outcome (`?checkout=success|cancelled|error`);
 * `billing` surfaces a failed portal open (`?billing=portal-error`).
 */
export function BillingCard({
  pro,
  hasBillingAccount,
  checkout,
  billing,
}: {
  pro: boolean;
  /** Whether the user's subscription row carries a Stripe customer id. */
  hasBillingAccount: boolean;
  checkout?: string;
  billing?: string;
}) {
  const billingConfigured = isBillingConfigured();

  return (
    <Card data-testid="billing-card">
      <CardHeader>
        <CardTitle asChild>
          <h2>Billing</h2>
        </CardTitle>
        <CardDescription>
          {pro
            ? "You're on the Pro plan. Thanks for your support!"
            : "Upgrade to Pro to support development."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {billing === "portal-error" ? (
          <p role="alert" className="text-destructive mb-3 text-sm">
            We couldn&apos;t open the billing portal. Please try again.
          </p>
        ) : null}
        {checkout === "success" ? (
          <p role="status" className="text-foreground mb-3 text-sm">
            Payment received — your Pro access activates momentarily.
          </p>
        ) : checkout === "cancelled" ? (
          <p role="status" className="text-muted-foreground mb-3 text-sm">
            Checkout cancelled — no charge was made.
          </p>
        ) : checkout === "error" ? (
          <p role="alert" className="text-destructive mb-3 text-sm">
            We couldn&apos;t start checkout. Please try again.
          </p>
        ) : null}
        {pro ? (
          <div className="flex flex-col gap-3">
            <p
              data-testid="billing-pro-note"
              className="text-muted-foreground text-sm"
            >
              Your Pro subscription is active.
            </p>
            {billingConfigured && hasBillingAccount ? (
              // Self-serve billing: cancel / payment method / invoices via
              // Stripe's hosted portal. Hidden for a comped Pro (no Stripe
              // customer) and for the keyless app/tests/CI.
              <ManageBillingButton />
            ) : null}
          </div>
        ) : billingConfigured ? (
          <UpgradeButton />
        ) : (
          <p
            data-testid="billing-not-configured"
            className="text-muted-foreground text-sm"
          >
            Billing not configured.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
