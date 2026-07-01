"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { logger } from "@repo/observability/logger";
import { Button } from "@repo/ui/components/ui/button";

/**
 * Segment error boundary: catches render errors in a page/segment WITHOUT
 * replacing the root layout (that is `global-error.tsx`). Logs always; forwards
 * to Sentry when configured (no-op otherwise).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.unexpected");

  useEffect(() => {
    // Single report path: @repo/observability's logger forwards an `error`-level
    // log (with the Error in `meta.error`) to Sentry when a DSN is configured.
    // Calling Sentry.captureException here too would double-report the same error.
    logger.error("segment render error", { error, digest: error.digest });
  }, [error]);

  return (
    <main
      id="main"
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("message")}</p>
      <Button onClick={reset}>{t("action")}</Button>
    </main>
  );
}
