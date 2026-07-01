"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { APIError, auth } from "@repo/auth/server";
import { db, desc, ownedBy, uploadedFile } from "@repo/db";
import { logger } from "@repo/observability/logger";
import { cancelStripeSubscription, getSubscription } from "@repo/payments";
import { deleteObject, isStorageConfigured } from "@repo/storage";

import { redirect } from "../../../i18n/navigation";
import { allowAction } from "../../../lib/action-limits";
import { requireSession } from "../../../lib/auth-actions";

/**
 * Account-settings Server Actions. Auth is verified INSIDE each action (repo
 * rule) and every mutation is per-user rate-limited (`account`, 10/min) — the
 * password-bearing ones especially must not be brute-forcible through an
 * authenticated session. All credential/session work goes through Better
 * Auth's server API (never hand-rolled), bound to THIS request's cookies via
 * `headers()`.
 */

/** Shared result shape for the settings forms (rendered inline). */
export type SettingsActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
};

const RATE_LIMITED: SettingsActionState = {
  status: "error",
  message: "Too many requests — please wait a moment and try again.",
};

/** Map a Better Auth error to a user-facing message without leaking internals. */
function authErrorMessage(error: unknown, fallback: string): string {
  return error instanceof APIError && error.message ? error.message : fallback;
}

const MAX_NAME_LENGTH = 100;

/** Update the signed-in user's display name. */
export async function updateName(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireSession();
  if (!(await allowAction("account", session.user.id))) return RATE_LIMITED;

  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return {
      status: "error",
      message: `Please enter a name (at most ${MAX_NAME_LENGTH} characters).`,
    };
  }

  try {
    await auth.api.updateUser({ body: { name }, headers: await headers() });
  } catch (error) {
    logger.error("updateName: failed", { error, userId: session.user.id });
    return {
      status: "error",
      message: authErrorMessage(error, "Could not update your name."),
    };
  }

  revalidatePath("/[locale]/settings", "layout");
  return { status: "success", message: "Name updated." };
}

/**
 * Change the signed-in user's password. Requires the CURRENT password (Better
 * Auth verifies it) and revokes every OTHER session on success, so a leaked
 * old credential can't keep a live session anywhere else.
 */
export async function changePassword(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireSession();
  if (!(await allowAction("account", session.user.id))) return RATE_LIMITED;

  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    currentPassword.length === 0
  ) {
    return { status: "error", message: "Please fill in both password fields." };
  }
  // Mirror the server-side floor in @repo/auth (minPasswordLength: 8) so the
  // user gets an inline reason instead of a generic API error.
  if (newPassword.length < 8) {
    return {
      status: "error",
      message: "New password must be at least 8 characters.",
    };
  }

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    logger.warn("changePassword: failed", { userId: session.user.id });
    return {
      status: "error",
      message: authErrorMessage(error, "Current password is incorrect."),
    };
  }

  // Success rotates the session cookie (and revokes other sessions). Returning
  // inline state would re-render THIS page in the same request cycle and race
  // the cookie rotation (a transient no-session render bounces to /sign-in →
  // /dashboard). A redirect ends the request cleanly, so the fresh cookie lands
  // on the next document load; the banner is surfaced from `?changed=password`.
  redirect({ href: "/settings?changed=password", locale: await getLocale() });
  // Unreachable (redirect throws) — satisfies the action's return type.
  return { status: "success" };
}

/** Sign out everywhere else: revoke every session except the current one. */
export async function revokeOtherSessions(): Promise<void> {
  const session = await requireSession();
  if (!(await allowAction("account", session.user.id))) return;

  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch (error) {
    logger.error("revokeOtherSessions: failed", {
      error,
      userId: session.user.id,
    });
    return;
  }
  revalidatePath("/[locale]/settings", "layout");
}

/**
 * Delete the signed-in user's account (GDPR "right to be forgotten").
 *
 * Order matters:
 * 1. READ the external-resource handles first (Stripe subscription id, S3
 *    object keys) — the delete's FK cascades wipe those rows.
 * 2. `auth.api.deleteUser` verifies the supplied password and deletes the
 *    user; every owner-table row cascades. If the password is wrong this
 *    THROWS and nothing external has been touched.
 * 3. Only after that succeeds, clean up the externals best-effort: cancel the
 *    Stripe subscription (a deleted user must never keep being charged) and
 *    delete the S3 objects. Failures are logged, not surfaced — the account
 *    is already gone, and both no-op keyless.
 */
export async function deleteAccount(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!(await allowAction("account", userId))) return RATE_LIMITED;

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return {
      status: "error",
      message: "Please enter your password to confirm deletion.",
    };
  }

  // (1) Snapshot external handles BEFORE the cascading delete.
  const [subscription, files] = await Promise.all([
    getSubscription(userId),
    db
      .select({ key: uploadedFile.key })
      .from(uploadedFile)
      .where(ownedBy(uploadedFile, userId))
      .orderBy(desc(uploadedFile.createdAt)),
  ]);

  // (2) Verify the password + delete the user (rows cascade). A wrong password
  // throws here, before any external side effect.
  try {
    await auth.api.deleteUser({
      body: { password },
      headers: await headers(),
    });
  } catch (error) {
    logger.warn("deleteAccount: rejected", { userId });
    return {
      status: "error",
      message: authErrorMessage(error, "Password is incorrect."),
    };
  }

  // (3) Best-effort external cleanup. Log-only: the account is gone either way.
  const cancel = await cancelStripeSubscription(
    subscription?.stripeSubscriptionId ?? null,
  );
  if (!cancel.ok && cancel.reason === "stripe_error") {
    logger.error("deleteAccount: Stripe cancel failed — reconcile manually", {
      userId,
      stripeSubscriptionId: subscription?.stripeSubscriptionId,
    });
  }
  if (isStorageConfigured()) {
    for (const file of files) {
      try {
        await deleteObject(file.key);
      } catch (error) {
        logger.error("deleteAccount: failed to delete object", {
          error,
          key: file.key,
        });
      }
    }
  }

  logger.info("deleteAccount: account deleted", { userId });
  redirect({ href: "/", locale: await getLocale() });
  // Unreachable (redirect throws) — satisfies the action's return type.
  return { status: "success" };
}
