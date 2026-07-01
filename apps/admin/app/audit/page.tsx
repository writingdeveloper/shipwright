import Link from "next/link";
import { auditLog, count, db, desc, eq } from "@repo/db";

import { requireAdmin } from "../../lib/admin-actions";

/**
 * Admin audit log — paginated + filterable by action. `auditLog` is NOT an
 * owner table; reads are gated by `requireAdmin`, not owner-scoped. The log
 * grows unbounded, so older entries are reachable via pagination, and the
 * `?action=` filter narrows to one action type for forensic drill-down.
 */
const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const action = (sp.action ?? "").trim();
  const offset = (page - 1) * PAGE_SIZE;
  const where = action ? eq(auditLog.action, action) : undefined;

  // The distinct action types (for the filter dropdown), the filtered total
  // (for pagination), and the current page of rows — in parallel.
  const [actions, [totals], rows] = await Promise.all([
    db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .orderBy(auditLog.action),
    db.select({ total: count() }).from(auditLog).where(where),
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const total = totals?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    `/audit?page=${p}${action ? `&action=${encodeURIComponent(action)}` : ""}`;

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <nav className="mb-4 text-sm">
        <Link href="/" className="underline">
          ← Dashboard
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">Audit log</h1>

      {/* Action filter — a GET form so the choice lives in the URL (shareable,
          bookmarkable, back-button-friendly), matching the /users search. */}
      <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor="action-filter" className="text-muted-foreground text-sm">
          Action
        </label>
        <select
          id="action-filter"
          name="action"
          defaultValue={action}
          className="border-input rounded-md border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>
              {a.action}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm"
        >
          Filter
        </button>
        {action ? (
          <Link
            href="/audit"
            className="text-muted-foreground text-sm underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-muted-foreground mt-3 text-sm" data-testid="audit-total">
        {total} {total === 1 ? "action" : "actions"}
        {action ? ` matching "${action}"` : " total"}.
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
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

      <div className="text-muted-foreground mt-4 flex items-center gap-4 text-sm">
        <span>
          Page {page} of {lastPage}
        </span>
        {page > 1 ? (
          <Link className="underline" href={pageHref(page - 1)}>
            ← Prev
          </Link>
        ) : null}
        {page < lastPage ? (
          <Link className="underline" href={pageHref(page + 1)}>
            Next →
          </Link>
        ) : null}
      </div>
    </main>
  );
}
