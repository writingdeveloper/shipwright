"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";

import { deleteTask } from "./actions";

/**
 * Delete control for a task row — a thin client wrapper over the `deleteTask`
 * Server-Action form. Its only job beyond submitting is to move focus to a
 * stable target (the section heading) BEFORE the row unmounts on revalidation:
 * otherwise a keyboard/screen-reader user who deletes a task is dropped to
 * <body>. The heading is paired with the aria-live count that announces the new
 * total, so the post-delete context is both focused and spoken.
 */
export function DeleteTaskButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations("dashboard.tasks");
  return (
    <form action={deleteTask}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive"
        aria-label={t("deleteAriaLabel", { title })}
        onClick={() => {
          // Fires before submit + the row's unmount on revalidate, so focus
          // lands on the heading instead of falling back to <body>.
          document.getElementById("tasks-heading")?.focus();
        }}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </form>
  );
}
