import {
  captureRequestError,
  initSentryServer,
} from "@repo/observability/instrumentation";

/**
 * Next.js instrumentation hook (server + edge). Runs once per runtime as the
 * server boots — the Next 15/16 home for Sentry's server/edge `Sentry.init`
 * (replacing the old `sentry.server.config.ts` / `sentry.edge.config.ts`).
 *
 * We branch on `process.env.NEXT_RUNTIME` (the canonical Sentry + Next pattern)
 * so `Sentry.init` runs for BOTH the Node.js and the Edge runtime. The shared
 * `initSentryServer()` is the same call for either — `@sentry/nextjs` resolves
 * the right runtime client from the bundle it is loaded into — and it is a
 * COMPLETE NO-OP when no `SENTRY_DSN` is set, so with no Sentry env this does
 * nothing and the production build/e2e run unaffected.
 */
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    initSentryServer();
  }
}

/**
 * Forward server-side request errors to Sentry. Safe to wire unconditionally:
 * when Sentry isn't initialised (no DSN) it has nothing to send and is inert.
 */
export const onRequestError = captureRequestError;
