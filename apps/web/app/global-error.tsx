"use client";

import { useEffect } from "react";
import { logger } from "@repo/observability/logger";

/**
 * App Router GLOBAL error boundary. Catches errors thrown while rendering the
 * root layout itself (the one place a normal `error.tsx` cannot reach), and is
 * the recommended spot to report render crashes to Sentry.
 *
 * Reporting is safe with or without Sentry: the structured `logger` ALWAYS
 * records the error, and forwards it to Sentry via the registered bridge when a
 * DSN is configured — so this does NOT also call `Sentry.captureException`
 * (which would double-report). Mirrors `app/error.tsx`. With no DSN it just logs
 * and renders the fallback.
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
    // Single report path (mirrors app/error.tsx): the logger forwards an
    // error-level log (with the Error in meta.error) to Sentry when a DSN is
    // configured, so calling Sentry.captureException here too would double-report.
    logger.error("unhandled render error", { error, digest: error.digest });
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
          {/* Root error boundary renders outside the NextIntlClientProvider, so
              strings stay literal — there is no translator in scope here. */}
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
