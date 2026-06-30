"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@repo/auth/server";
import { recordAuditLog } from "@repo/db";
import { logger } from "@repo/observability/logger";

import { requireAdmin } from "./admin-actions";

/**
 * Admin user-management mutations. Each verifies `requireAdmin()` at the data
 * layer (repo rule — never trust the page), refuses to act on the admin's OWN
 * account for destructive ops (self-protection — you can't lock yourself out),
 * calls the Better Auth admin server API (which ALSO authorizes on the caller's
 * session role), then records an audit-log row. Mutations are Server Actions
 * (CSRF + progressive enhancement), so the client never calls an admin method —
 * no `adminClient()` plugin is needed.
 */

/** Best-effort audit write — log + continue if it fails (the action already happened). */
async function audit(
  actorUserId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAuditLog({
      actorUserId,
      action,
      targetType: "user",
      targetId,
      metadata,
    });
  } catch (error) {
    logger.error("audit log write failed", { error, action, targetId });
  }
}

export async function setUserRole(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "user";
  if (!userId) return;
  // Never change your own role (prevents an admin self-demoting to lockout).
  if (userId === actorId) return;
  await auth.api.setRole({ body: { userId, role }, headers: await headers() });
  await audit(actorId, "user.role.set", userId, { role });
  revalidatePath("/users");
}

export async function banUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actorId) return; // can't ban yourself
  const reason = String(formData.get("reason") ?? "").trim();
  await auth.api.banUser({
    body: { userId, ...(reason ? { banReason: reason } : {}) },
    headers: await headers(),
  });
  await audit(actorId, "user.ban", userId, reason ? { banReason: reason } : undefined);
  revalidatePath("/users");
}

export async function unbanUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await auth.api.unbanUser({ body: { userId }, headers: await headers() });
  await audit(actorId, "user.unban", userId);
  revalidatePath("/users");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actorId) return; // can't delete yourself
  await auth.api.removeUser({ body: { userId }, headers: await headers() });
  await audit(actorId, "user.delete", userId);
  revalidatePath("/users");
}
