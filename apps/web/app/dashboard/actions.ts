"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@repo/auth/server";
import { and, db, eq, sql, task } from "@repo/db";

const MAX_TITLE_LENGTH = 280;

/**
 * Resolve the signed-in user's id for a mutation, or bail out.
 *
 * Auth is verified INSIDE every action (repo rule): we never trust the page or
 * middleware to have gated this call. A missing session redirects to sign-in
 * rather than throwing a raw error to the client.
 */
async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  return session.user.id;
}

export async function createTask(formData: FormData): Promise<void> {
  const userId = await requireUserId();

  const raw = formData.get("title");
  const title = typeof raw === "string" ? raw.trim() : "";

  // Validate: non-empty, trimmed, bounded length. Silently ignore empty
  // submissions (e.g. whitespace-only) instead of persisting junk rows.
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return;
  }

  await db.insert(task).values({ userId, title });

  revalidatePath("/dashboard");
}

export async function toggleTask(formData: FormData): Promise<void> {
  const userId = await requireUserId();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return;
  }

  // Flip `completed` in a single atomic statement (no read-then-write race),
  // scoped by BOTH the task id AND the owner. A user can never mutate another
  // user's task by guessing its id: the userId predicate makes the UPDATE match
  // zero rows for non-owned ids.
  await db
    .update(task)
    .set({ completed: sql`NOT ${task.completed}` })
    .where(and(eq(task.id, id), eq(task.userId, userId)));

  revalidatePath("/dashboard");
}

export async function deleteTask(formData: FormData): Promise<void> {
  const userId = await requireUserId();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return;
  }

  // Same ownership scoping as toggle: delete only when the row belongs to the
  // signed-in user.
  await db.delete(task).where(and(eq(task.id, id), eq(task.userId, userId)));

  revalidatePath("/dashboard");
}
