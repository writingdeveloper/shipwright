import Link from "next/link";
import { notFound } from "next/navigation";
import { db, eq, user } from "@repo/db";
import { getSubscription, isStripeConfigured } from "@repo/payments";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";

import { requireAdmin } from "../../../lib/admin-actions";
import {
  extendAction,
  grantProAction,
  refundAction,
  revokeProAction,
} from "../../../lib/billing-actions";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;

  const [target] = await db.select().from(user).where(eq(user.id, userId));
  if (!target) notFound();

  const sub = await getSubscription(userId);
  const stripeReady = isStripeConfigured();
  const stripeDisabled = !stripeReady || !sub?.stripeSubscriptionId;

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <nav className="mb-4 text-sm">
        <Link href="/users" className="underline">
          ← Users
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">{target.email}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Role: {target.role === "admin" ? "admin" : "user"}
      </p>

      <section className="mt-6">
        <h2 className="font-medium">Subscription</h2>
        <p className="text-sm" data-testid="sub-summary">
          {sub
            ? `${sub.plan ?? "?"} · ${sub.status ?? "?"}`
            : "No subscription (free)"}
        </p>
      </section>

      <section className="mt-6 grid max-w-md gap-4">
        <h2 className="font-medium">Billing actions</h2>

        <form action={grantProAction} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <label className="text-sm">
            Days
            <Input
              type="number"
              name="days"
              defaultValue={30}
              min={1}
              className="w-24"
              aria-label="Comp days"
            />
          </label>
          <Button type="submit">Grant Pro</Button>
        </form>

        <form action={revokeProAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="outline">
            Revoke Pro
          </Button>
        </form>

        <form action={refundAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="outline" disabled={stripeDisabled}>
            Refund last payment
          </Button>
          {stripeDisabled ? (
            <span className="text-muted-foreground ml-2 text-xs">
              Stripe not configured
            </span>
          ) : null}
        </form>

        <form action={extendAction} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <label className="text-sm">
            Days
            <Input
              type="number"
              name="days"
              defaultValue={7}
              min={1}
              className="w-24"
              aria-label="Extend days"
            />
          </label>
          <Button type="submit" variant="outline" disabled={stripeDisabled}>
            Extend
          </Button>
        </form>
      </section>
    </main>
  );
}
