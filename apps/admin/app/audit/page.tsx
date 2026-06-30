import Link from "next/link";
import { auditLog, db, desc } from "@repo/db";

import { requireAdmin } from "../../lib/admin-actions";

/** Admin audit log, newest first. `auditLog` is NOT an owner table — reads are
 *  gated by `requireAdmin`, not owner-scoped. */
export default async function AuditPage() {
  await requireAdmin();

  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <nav className="mb-4 text-sm">
        <Link href="/" className="underline">
          ← Dashboard
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Most recent {rows.length} admin actions.
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 pr-4">When</th>
            <th className="py-2 pr-4">Actor</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Target</th>
            <th className="py-2">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-testid={`audit-row-${r.action}`}
              className="border-b"
            >
              <td className="py-2 pr-4">{r.createdAt.toISOString()}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.actorUserId}</td>
              <td className="py-2 pr-4">{r.action}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.targetId}</td>
              <td className="py-2 font-mono text-xs">{r.metadata ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
