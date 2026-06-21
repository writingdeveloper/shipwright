"use server";

import { revalidatePath } from "next/cache";
import { and, db, eq, sql, task } from "@repo/db";
import { logger } from "@repo/observability/logger";

import { requireUserId } from "../../../lib/auth-actions";
import { MAX_TITLE_LENGTH, normalizeTitle } from "./validation";

/** Result of {@link createTask}, surfaced inline by the add-task form. */
export type CreateTaskState = {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
};

// `useActionState` signature: (previousState, formData) => nextState. The form
// reads the returned state to show an inline rejection reason and to clear the
// input on success — so a rejected or successful add is no longer silent.
export async function createTask(
  _prev: CreateTaskState,
  formData: FormData,
): Promise<CreateTaskState> {
  const userId = await requireUserId();

  // Validate via the shared pure helper (non-empty, trimmed, bounded length).
  // Reject junk instead of persisting it, but tell the user WHY (and record the
  // reject — without the raw value — so a flood is visible in logs/Sentry).
  const raw = formData.get("title");
  const title = normalizeTitle(raw);
  if (title === null) {
    logger.warn("createTask: rejected invalid title", { userId });
    const trimmedLength = typeof raw === "string" ? raw.trim().length : 0;
    return {
      status: "error",
      message:
        trimmedLength > MAX_TITLE_LENGTH
          ? `Title must be at most ${MAX_TITLE_LENGTH} characters.`
          : "Please enter a task title.",
    };
  }

  try {
    await db.insert(task).values({ userId, title });
  } catch (error) {
    // Structured-log the failure (and forward to Sentry when configured) before
    // rethrowing so Next still renders its error boundary. With no Sentry DSN
    // this is just a clean server log line — no key required.
    logger.error("createTask: failed to insert task", { error, userId });
    throw error;
  }

  revalidatePath("/dashboard");
  return { status: "success" };
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
