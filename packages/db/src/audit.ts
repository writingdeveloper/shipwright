import type { Database } from "./client";
import { auditLog } from "./schema";

/** One sensitive admin action to record in the audit log. */
export type AuditEntry = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append an audit-log row. `metadata` is JSON-stringified (or null). Pass a
 * `client` to use a specific db (tests pass a throwaway one); when omitted the
 * libSQL singleton is loaded LAZILY — importing it at module top would pull in
 * `@repo/env` validation, which a unit test (that supplies its own db) must not
 * require. Callers should await this but treat a failure as non-fatal (log +
 * continue) — the action it records has already happened.
 */
export async function recordAuditLog(
  entry: AuditEntry,
  client?: Database,
): Promise<void> {
  const c = client ?? (await import("./client")).db;
  await c.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
  });
}
