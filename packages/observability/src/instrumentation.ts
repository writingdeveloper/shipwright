import * as Sentry from "@sentry/nextjs";

import { isSentryEnabled, sentryDsn, tracesSampleRate } from "./config";
import { setSentryBridge, type LogLevel, type LogMeta } from "./logger";

/**
 * @repo/observability — SERVER + EDGE Sentry init, wired from the app's
 * `instrumentation.ts` (the Next 15/16 convention).
 *
 * GRACEFUL DEGRADATION: with no DSN, {@link initSentryServer} returns WITHOUT
 * calling `Sentry.init`, so the SDK is inert — no transport is created, no events
 * are sent, and nothing is required at build or runtime. With a DSN it initialises
 * Sentry once for whichever runtime is loading (Node.js or Edge) and registers the
 * Sentry bridge on `@repo/observability/logger` so `logger.warn/error` also reach
 * Sentry.
 *
 * Importing `@sentry/nextjs` at the top is safe even when disabled: the import has
 * no side effects, and `Sentry.init` is simply never called, so the no-DSN path
 * stays a true no-op while the module remains tree-shakeable per runtime by Next.
 */

/** Map our log levels onto Sentry's severity levels. */
function toSentryLevel(level: LogLevel): Sentry.SeverityLevel {
  return level === "warn" ? "warning" : level;
}

/** Bridge `logger.warn/error` into Sentry once init has run. */
function registerLoggerBridge(): void {
  setSentryBridge({
    captureMessage: (message: string, level: LogLevel, meta?: LogMeta) => {
      Sentry.captureMessage(message, {
        level: toSentryLevel(level),
        extra: meta,
      });
    },
    captureException: (error: unknown, meta?: LogMeta) => {
      Sentry.captureException(error, { extra: meta });
    },
  });
}

/**
 * Initialise Sentry for the current SERVER or EDGE runtime. Idempotent and a
 * no-op when no DSN is configured. Call from the app's `register()` in
 * `instrumentation.ts`, branching on `process.env.NEXT_RUNTIME`.
 */
export function initSentryServer(): void {
  if (!isSentryEnabled()) return;

  Sentry.init({
    dsn: sentryDsn(),
    // Performance tracing at a conservative default rate; tune via env.
    tracesSampleRate: tracesSampleRate(),
    // Keep PII out by default; opt in per-deployment if needed.
    sendDefaultPii: false,
    // Quiet unless explicitly debugging the SDK itself.
    debug: false,
  });

  registerLoggerBridge();
}

/**
 * Re-export Sentry's request-error capture so the app's
 * `onRequestError` hook in `instrumentation.ts` can forward server errors. It is
 * safe to wire unconditionally: when Sentry isn't initialised (no DSN) it has
 * nothing to send and quietly does nothing.
 */
export const captureRequestError = Sentry.captureRequestError;
