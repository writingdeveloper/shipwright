"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/ui/button";

import { deleteUserAction } from "../../lib/user-actions";

/**
 * Two-click delete confirm — NO native `confirm()` (it blocks automation + is
 * poor UX). First click reveals Confirm/Cancel; Confirm submits the
 * `deleteUserAction` Server Action. Disabled for the signed-in admin's own row.
 */
export function DeleteUserButton({
  userId,
  disabled,
}: {
  userId: string;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (disabled) {
    return (
      <Button type="button" variant="destructive" size="sm" disabled>
        Delete
      </Button>
    );
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Delete
      </Button>
    );
  }

  return (
    <form action={deleteUserAction} className="inline-flex gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="destructive" size="sm">
        Confirm
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </form>
  );
}
