import * as Sentry from "@sentry/nextjs";

import { DEFAULT_TRACES_SAMPLE_RATE, publicSentryDsn } from "./config";
import { setSentryBridge, type LogLevel, type LogMeta } from "./logger";

/**
 * @repo/observability — BROWSER Sentry init, wired from the app's
 * `instrumentation-client.ts` (the Next 15/16 convention that replaces
 * `sentry.client.config.ts`).
 *
 * GRACEFUL DEGRADATION: with no `NEXT_PUBLIC_SENTRY_DSN`, {@link initSentryClient}
 * returns WITHOUT calling `Sentry.init`, so the browser SDK is inert — it opens no
 * connection (the proxy also leaves the CSP `connect-src` unbroadened in that case)
 * and captures nothing. With a public DSN it initialises once and bridges
 * `logger.warn/error` into Sentry.
 *
 * Only the PUBLIC DSN is honoured here: a browser can never see the server-only
 * `SENTRY_DSN`, so the client gate is `NEXT_PUBLIC_SENTRY_DSN` specifically. We
 * deliberately do NOT call the shared `isSentryEnabled()` here — it reads the
 * server-only `SENTRY_DSN`, and t3-env THROWS on a server-var access from client
 * code, which would crash the client bundle (and hydration) before React runs.
 */

function toSentryLevel(level: LogLevel): Sentry.SeverityLevel {
  return level === "warn" ? "warning" : level;
}

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
 * Initialise the browser Sentry SDK. No-op when no public DSN is configured.
 * Call once from the app's `instrumentation-client.ts`.
 */
export function initSentryClient(): void {
  // Gate ONLY on the public DSN — never touch the server-only `SENTRY_DSN`.
  const dsn = publicSentryDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Use the fixed default rather than the server-only
    // SENTRY_TRACES_SAMPLE_RATE so we never read a server var on the client.
    tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    debug: false,
  });

  registerLoggerBridge();
}

/**
 * Sentry's navigation-instrumentation hook. Next 15/16 expects
 * `instrumentation-client.ts` to export `onRouterTransitionStart`; re-exporting
 * it here keeps the app file a thin shim. Safe to export unconditionally: with no
 * DSN the SDK is uninitialised and the hook does nothing.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
