import { isBillingConfigured } from "@repo/payments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { UpgradeButton } from "./upgrade-button";

/**
 * Billing card. `pro` is passed down from the page (which already reads it for
 * the header Pro badge — avoiding a duplicate isPro query); `billingConfigured`
 * is read here. `checkout` surfaces the Stripe redirect outcome
 * (`?checkout=success|cancelled|error`).
 */
export function BillingCard({
  pro,
  checkout,
}: {
  pro: boolean;
  checkout?: string;
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
          <p
            data-testid="billing-pro-note"
            className="text-muted-foreground text-sm"
          >
            Your Pro subscription is active.
          </p>
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
