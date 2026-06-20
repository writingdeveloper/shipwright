"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@repo/observability/logger";

/**
 * App Router GLOBAL error boundary. Catches errors thrown while rendering the
 * root layout itself (the one place a normal `error.tsx` cannot reach), and is
 * the recommended spot to report render crashes to Sentry.
 *
 * Reporting is safe with or without Sentry: `Sentry.captureException` is a no-op
 * when Sentry was never initialised (no `NEXT_PUBLIC_SENTRY_DSN`), and the
 * structured `logger` ALWAYS records the error to the server logs regardless. So
 * with no Sentry env this still logs and renders the fallback — it just doesn't
 * forward to Sentry.
 *
 * It must render its own <html>/<body> because it REPLACES the root layout when
 * the root layout is what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("unhandled render error", {
      error,
      digest: error.digest,
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        {/* This boundary replaces the root layout, so it must carry its own
            skip-link + target (the layout's are gone when it renders). */}
        <a
          href="#main"
          className="bg-background text-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <main
          id="main"
          className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. You can try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
