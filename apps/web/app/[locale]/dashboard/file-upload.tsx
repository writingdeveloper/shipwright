"use client";

import { type ChangeEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";

import { requestUploadUrl, saveFileRecord } from "./file-actions";

/**
 * Upload control: pick a file → ask the server for a presigned PUT URL → PUT the
 * bytes straight to the bucket (never through our server) → record the metadata
 * → refresh the list. Multi-step async, so it uses `useTransition` for the
 * refresh rather than `useActionState`. Errors are surfaced inline via an
 * `role="alert"` live region; the hidden file input is triggered by the visible
 * button and carries an `sr-only` label so it stays accessible.
 */
export function FileUpload() {
  const t = useTranslations("dashboard.files");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { key, url } = await requestUploadUrl(file.name, file.type, file.size);
      const res = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!res.ok)
        throw new Error(t("errorUploadStatus", { status: res.status }));
      await saveFileRecord(key, file.name, file.size, file.type);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorUpload"));
    } finally {
      setBusy(false);
      // Clear the input so picking the same file again re-fires onChange.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const disabled = busy || pending;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="file-upload-input" className="sr-only">
        {t("uploadLabel")}
      </label>
      <input
        ref={inputRef}
        id="file-upload-input"
        type="file"
        className="sr-only"
        onChange={onChange}
        disabled={disabled}
      />
      <div>
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {busy ? t("uploadLoading") : t("upload")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
