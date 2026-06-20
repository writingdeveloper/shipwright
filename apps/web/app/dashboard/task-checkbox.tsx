"use client";

import { useRef } from "react";
import { Checkbox } from "@repo/ui/components/ui/checkbox";

import { toggleTask } from "./actions";

/**
 * Accessible, self-submitting completion toggle for a single task.
 *
 * The shadcn `Checkbox` is a Radix client component, so it can't live as a bare
 * control inside a server-action `<form>` and still submit on change. This thin
 * client wrapper bridges that: changing the checkbox calls `requestSubmit()` on
 * its enclosing form, which posts to the `toggleTask` server action. The form
 * still works without JS (the checkbox falls back to a native checkbox value),
 * and the control is keyboard-operable with an explicit `aria-label`.
 */
export function TaskCheckbox({
  id,
  title,
  completed,
}: {
  id: string;
  title: string;
  completed: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={toggleTask} className="flex items-center">
      <input type="hidden" name="id" value={id} />
      <Checkbox
        id={`task-${id}`}
        defaultChecked={completed}
        onCheckedChange={() => formRef.current?.requestSubmit()}
        aria-label={
          completed
            ? `Mark "${title}" as not done`
            : `Mark "${title}" as done`
        }
      />
    </form>
  );
}
