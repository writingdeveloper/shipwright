"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";

import { createTask, type CreateTaskState } from "./actions";

const INITIAL_STATE: CreateTaskState = { status: "idle" };

/**
 * Add-task form with real feedback. Uses `useActionState` so the `createTask`
 * Server Action can return a result the UI reacts to:
 * - on REJECT (empty / too long) it shows an inline, screen-reader-announced
 *   error wired to the input via `aria-describedby` + `aria-invalid`;
 * - on SUCCESS it clears the field (a Server-Action form doesn't reset itself),
 *   so the input is ready for the next task instead of keeping the old text.
 * The submit button reflects the pending state. The new task itself appears in
 * the RSC list below (revalidated by the action), which is the primary success
 * signal.
 */
export function AddTaskForm() {
  const t = useTranslations("dashboard.addTask");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createTask,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  const hasError = state.status === "error";

  return (
    <form ref={formRef} action={formAction} className="flex items-start gap-2">
      <div className="flex-1">
        <label htmlFor="task-title" className="sr-only">
          {t("label")}
        </label>
        <Input
          id="task-title"
          name="title"
          placeholder={t("placeholder")}
          autoComplete="off"
          maxLength={280}
          required
          disabled={pending}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "task-title-error" : undefined}
        />
        {hasError ? (
          <p
            id="task-title-error"
            role="alert"
            className="text-destructive mt-1.5 text-sm"
          >
            {state.message}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("submitLoading") : t("submit")}
      </Button>
    </form>
  );
}
