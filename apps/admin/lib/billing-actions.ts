"use server";

import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@repo/db";
import {
  extendSubscription,
  getSubscription,
  grantProComp,
  refundLatestPayment,
  revokeProComp,
} from "@repo/payments";
import { logger } from "@repo/observability/logger";

import { requireAdmin } from "./admin-actions";

/**
 * Admin billing remediation, per user. Each verifies `requireAdmin()`, calls a
 * keyless-graceful @repo/payments function, audits the result (including a
 * `not_configured` keyless no-op, so the attempt is always visible), and
 * revalidates the user's detail page. No self-protection guard — billing is not
 * a security lockout (unlike role/ban/delete).
 */
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

function readDays(formData: FormData, fallback: number): number {
  const n = Number(formData.get("days"));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function grantProAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const days = readDays(formData, 30);
  const result = await grantProComp(userId, days);
  await audit(actorId, "billing.comp.grant", userId, { days, result });
  revalidatePath(`/users/${userId}`);
}

export async function revokeProAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const result = await revokeProComp(userId);
  await audit(actorId, "billing.comp.revoke", userId, { result });
  revalidatePath(`/users/${userId}`);
}

export async function refundAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const sub = await getSubscription(userId);
  const result = await refundLatestPayment(sub?.stripeSubscriptionId ?? null);
  await audit(actorId, "billing.refund", userId, { result });
  revalidatePath(`/users/${userId}`);
}

export async function extendAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const days = readDays(formData, 7);
  const sub = await getSubscription(userId);
  const result = await extendSubscription(
    sub?.stripeSubscriptionId ?? null,
    days,
  );
  await audit(actorId, "billing.extend", userId, { days, result });
  revalidatePath(`/users/${userId}`);
}
