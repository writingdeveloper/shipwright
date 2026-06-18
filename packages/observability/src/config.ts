import { env } from "@repo/env";

/**
 * @repo/observability — pure, framework-free Sentry configuration.
 *
 * Mirrors `@repo/analytics/config`: it derives the "is Sentry even configured?"
 * decision and the CSP `connect-src` origin from `@repo/env`, with NO Sentry
 * import and nothing that touches the DOM, so it is safe to use from the proxy
 * (to extend the CSP) and is trivially unit-testable.
 *
 * GRACEFUL DEGRADATION starts here: if neither `SENTRY_DSN` nor
 * `NEXT_PUBLIC_SENTRY_DSN` is set, the whole package degrades to a no-op —
 * `Sentry.init` is skipped, `withSentryConfig` leaves the build untouched and
 * uploads no source maps, and the CSP is NOT broadened — so the app, tests, and
 * CI run with no Sentry account.
 */

/**
 * The effective Sentry DSN, preferring the server var and falling back to the
 * public one (the browser can only see `NEXT_PUBLIC_SENTRY_DSN`; the server may
 * use either). `undefined` ⇒ Sentry is disabled.
 */
export function sentryDsn(): string | undefined {
  return env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN;
}

/** The browser-visible DSN, or `undefined`. Used by the client init helper. */
export function publicSentryDsn(): string | undefined {
  return env.NEXT_PUBLIC_SENTRY_DSN;
}

/**
 * Is Sentry configured? True only when a DSN is present. This is the single gate
 * the init helpers and `withSentryConfig` wrapper use to decide whether to do
 * anything at all.
 */
export function isSentryEnabled(): boolean {
  return Boolean(sentryDsn());
}

/** Conservative default performance-traces sample rate when none is configured. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

/**
 * The SERVER-side traces sample rate (0..1), tunable via the server-only
 * `SENTRY_TRACES_SAMPLE_RATE`. Used by the server/edge init.
 *
 * NOTE: this reads a SERVER var, so it must NOT be called from client code —
 * t3-env throws on a server-var access in the browser. The client init uses
 * {@link DEFAULT_TRACES_SAMPLE_RATE} directly instead.
 */
export function tracesSampleRate(): number {
  const raw = env.SENTRY_TRACES_SAMPLE_RATE;
  if (raw === undefined) return DEFAULT_TRACES_SAMPLE_RATE;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE;
  }
  return parsed;
}

/**
 * The CSP `connect-src` origin the Sentry BROWSER SDK needs to POST events to —
 * but ONLY when Sentry is enabled (a DSN is set). When disabled this returns an
 * empty array so the production CSP is NOT broadened for a feature that will
 * never connect (exactly like `analyticsConnectSrc`).
 *
 * The browser SDK sends envelopes to the ingest host encoded IN the DSN: a DSN
 * looks like `https://<publicKey>@<host>/<projectId>`, and the SDK derives the
 * ingest URL from that `<host>`. So the DSN's origin is precisely the origin we
 * must allow. A malformed DSN contributes nothing rather than crashing the CSP
 * build.
 */
export function sentryConnectSrc(): string[] {
  const dsn = sentryDsn();
  if (!dsn) return [];
  try {
    return [new URL(dsn).origin];
  } catch {
    return [];
  }
}
