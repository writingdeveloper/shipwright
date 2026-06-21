"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";

import { deleteFile } from "./file-actions";

/**
 * Delete control for a file row — mirrors {@link DeleteTaskButton}: a thin client
 * wrapper over the `deleteFile` Server-Action form that moves focus to the
 * section heading BEFORE the row unmounts on revalidation, so a keyboard/screen-
 * reader user isn't dropped to <body>.
 */
export function DeleteFileButton({ id, name }: { id: string; name: string }) {
  return (
    <form action={deleteFile}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Delete "${name}"`}
        onClick={() => {
          document.getElementById("files-heading")?.focus();
        }}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </form>
  );
}
