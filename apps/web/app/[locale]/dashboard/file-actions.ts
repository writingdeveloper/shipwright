"use server";

import { revalidatePath } from "next/cache";
import { and, db, desc, eq, uploadedFile } from "@repo/db";
import { logger } from "@repo/observability/logger";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteObject,
  isStorageConfigured,
} from "@repo/storage";

import { requireUserId } from "../../../lib/auth-actions";

/** Upload size ceiling (10 MB). Checked when minting the URL AND on save. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type UploadTicket = { readonly key: string; readonly url: string };

export type FileListItem = {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly url: string;
};

/** Sanitize a client filename to a safe, bounded basename (no path separators). */
function safeName(name: unknown): string {
  if (typeof name !== "string") return "file";
  const base = name.replace(/[/\\]/g, "_").trim().slice(0, 200);
  return base.length > 0 ? base : "file";
}

function safeContentType(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? value
    : "application/octet-stream";
}

/**
 * Mint a presigned PUT URL the browser uploads to directly (no bytes through our
 * server). The object key is namespaced by userId so one user's objects can't
 * collide with — or be addressed as — another's; `saveFileRecord` re-checks the
 * prefix.
 *
 * A presigned PUT can't itself enforce a byte ceiling (that needs a presigned
 * POST policy — out of scope), so we pre-check the client-reported size here and
 * re-check the real size on save: defence in depth, not a hard cap.
 */
export async function requestUploadUrl(
  name: string,
  contentType: string,
  size: number,
): Promise<UploadTicket> {
  const userId = await requireUserId();
  if (!isStorageConfigured()) {
    throw new Error("Storage is not configured");
  }
  if (typeof size === "number" && size > MAX_FILE_BYTES) {
    throw new Error("File is too large (max 10 MB).");
  }
  const key = `${userId}/${crypto.randomUUID()}-${safeName(name)}`;
  const url = await createPresignedUploadUrl({
    key,
    contentType: safeContentType(contentType),
  });
  return { key, url };
}

/**
 * Record the uploaded object's metadata after a successful PUT. The client sends
 * the key back, so we reject any key NOT in this user's namespace — a forged key
 * can't attach another user's object to this account.
 */
export async function saveFileRecord(
  key: string,
  name: string,
  size: number,
  contentType: string,
): Promise<void> {
  const userId = await requireUserId();
  if (typeof key !== "string" || !key.startsWith(`${userId}/`)) {
    logger.warn("saveFileRecord: rejected key outside owner namespace", {
      userId,
    });
    return;
  }
  if (
    typeof size !== "number" ||
    !Number.isFinite(size) ||
    size < 0 ||
    size > MAX_FILE_BYTES
  ) {
    logger.warn("saveFileRecord: rejected invalid size", { userId });
    return;
  }
  try {
    await db.insert(uploadedFile).values({
      userId,
      key,
      name: safeName(name),
      size: Math.floor(size),
      contentType: safeContentType(contentType),
    });
  } catch (error) {
    logger.error("saveFileRecord: failed to insert file record", {
      error,
      userId,
    });
    throw error;
  }
  revalidatePath("/dashboard");
}

/**
 * The signed-in user's files, newest first, each with a short-lived presigned
 * download URL (the bucket is private — there are no public object URLs).
 * Returns [] when storage isn't configured so the page renders deterministically.
 */
export async function listFiles(): Promise<readonly FileListItem[]> {
  const userId = await requireUserId();
  if (!isStorageConfigured()) return [];
  const rows = await db
    .select()
    .from(uploadedFile)
    .where(eq(uploadedFile.userId, userId))
    .orderBy(desc(uploadedFile.createdAt));
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      size: row.size,
      url: await createPresignedDownloadUrl(row.key),
    })),
  );
}

/**
 * Delete one of the user's files: owner-scoped lookup of the key, best-effort
 * object delete, then the row. Scoped by BOTH id AND userId so a guessed id
 * touches zero rows.
 */
export async function deleteFile(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) return;
  const [row] = await db
    .select({ key: uploadedFile.key })
    .from(uploadedFile)
    .where(and(eq(uploadedFile.id, id), eq(uploadedFile.userId, userId)));
  if (!row) return;
  try {
    if (isStorageConfigured()) await deleteObject(row.key);
  } catch (error) {
    // A dangling object is less bad than an undeletable row — log + continue.
    logger.error("deleteFile: failed to delete object", { error, userId });
  }
  await db
    .delete(uploadedFile)
    .where(and(eq(uploadedFile.id, id), eq(uploadedFile.userId, userId)));
  revalidatePath("/dashboard");
}
