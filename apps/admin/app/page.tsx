import Link from "next/link";
import { acrossAllOwners, count, db, subscription, task } from "@repo/db";

import { requireAdmin } from "../lib/admin-actions";

/**
 * Admin dashboard (root, gated). `requireAdmin()` runs at the data layer before
 * any read. The cross-owner counts are the first real consumer of the
 * `acrossAllOwners()` seam: a deliberate, role-gated read across ALL owners
 * (contrast the per-user `ownedBy`/`ownedRow` the user app uses).
 */
export default async function AdminDashboard() {
  await requireAdmin();

  const [taskRows, subRows] = await Promise.all([
    db.select({ value: count() }).from(task).where(acrossAllOwners()),
    db.select({ value: count() }).from(subscription).where(acrossAllOwners()),
  ]);

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Cross-owner totals (role-gated via acrossAllOwners).
      </p>
      <nav className="mt-4 flex gap-4 text-sm">
        <Link href="/users" className="underline">
          Manage users
        </Link>
        <Link href="/audit" className="underline">
          Audit log
        </Link>
      </nav>
      <dl className="mt-6 grid max-w-md grid-cols-2 gap-4">
        <div>
          <dt className="text-muted-foreground text-sm">Total tasks</dt>
          <dd data-testid="task-count" className="text-3xl font-bold">
            {taskRows[0]?.value ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Total subscriptions</dt>
          <dd data-testid="sub-count" className="text-3xl font-bold">
            {subRows[0]?.value ?? 0}
          </dd>
        </div>
      </dl>
    </main>
  );
}
