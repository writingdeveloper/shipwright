/**
 * @repo/observability — a tiny, dependency-free STRUCTURED logger.
 *
 * This is the always-on half of the package: it needs NO key and NO Sentry
 * account, so it is safe everywhere (server, edge, tests, CI, local dev) and is
 * the default way to emit operational logs in this repo instead of bare
 * `console.*`. Each call produces a single levelled, JSON-ish line:
 *
 *   {"level":"warn","time":"2026-06-17T12:00:00.000Z","msg":"email skipped","reason":"no key"}
 *
 * Why JSON-ish and not pretty text: structured lines are greppable and parse
 * cleanly in a log drain (Vercel, Datadog, CloudWatch, …) while staying readable
 * in a terminal. We intentionally do NOT pull in pino/winston — the repo
 * discipline is to own small glue like this and adopt heavy libraries only for
 * the hard problems (auth, ORM, crypto). When Sentry IS configured, `error`/
 * `warn` also forward to it (see the lazy bridge below); with no DSN that bridge
 * is a no-op, so the logger's behaviour is identical with or without a key.
 *
 * Server-safe by construction: it touches only `console` and `Date`, never the
 * DOM, so it runs unchanged in a Server Component, Server Action, Route Handler,
 * the proxy/edge runtime, or a plain Node script.
 */

/** Log levels in ascending severity. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Arbitrary structured context merged into the log line. */
export type LogMeta = Record<string, unknown>;

/**
 * Optional sink Sentry registers at init so `warn`/`error` are also captured as
 * breadcrumbs/exceptions. Kept as a settable hook (rather than importing Sentry
 * here) so the logger stays dependency-free and the no-DSN path never loads
 * `@sentry/nextjs`. `undefined` ⇒ logging is console-only.
 */
export type SentryBridge = {
  readonly captureMessage: (message: string, level: LogLevel, meta?: LogMeta) => void;
  readonly captureException: (error: unknown, meta?: LogMeta) => void;
};

let sentryBridge: SentryBridge | undefined;

/**
 * Register (or clear) the Sentry bridge. Called once by the Sentry init helpers
 * WHEN a DSN exists; never called on the no-key path, so the logger forwards to
 * Sentry only when Sentry is actually configured.
 */
export function setSentryBridge(bridge: SentryBridge | undefined): void {
  sentryBridge = bridge;
}

/** Numeric severity used to honour the configured minimum level. */
const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Minimum level to emit. Defaults to `debug` in development and `info` in
 * production (so debug noise doesn't reach prod drains), overridable with
 * `LOG_LEVEL`. Read once at module load from `process.env` directly — this
 * module is deliberately NOT coupled to `@repo/env` so it can be imported from
 * anywhere, including before env validation, without a circular dependency.
 */
function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const minLevel: LogLevel = resolveMinLevel();

/** JSON-stringify safely, never throwing on a circular structure or BigInt. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") return val.toString();
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    return val;
  });
}

/** Map a level to the matching `console` method (error→error, warn→warn, …). */
function consoleFor(level: LogLevel): (line: string) => void {
  switch (level) {
    case "error":
      return console.error.bind(console);
    case "warn":
      return console.warn.bind(console);
    default:
      // `debug`/`info` → console.log so they aren't dropped by a console that
      // silences console.debug.
      return console.log.bind(console);
  }
}

function emit(level: LogLevel, msg: string, meta?: LogMeta): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;

  const record = {
    level,
    time: new Date().toISOString(),
    msg,
    ...(meta ?? {}),
  };

  consoleFor(level)(safeStringify(record));

  // Forward to Sentry when (and only when) a bridge is registered. `error`
  // becomes an exception if a real Error is supplied, otherwise a message.
  if (sentryBridge) {
    if (level === "error") {
      const maybeError = meta?.error ?? meta?.err ?? meta?.cause;
      if (maybeError !== undefined) {
        sentryBridge.captureException(maybeError, { ...meta, msg });
      } else {
        sentryBridge.captureMessage(msg, level, meta);
      }
    } else if (level === "warn") {
      sentryBridge.captureMessage(msg, level, meta);
    }
  }
}

/**
 * The structured logger. Each method takes a human message and optional
 * structured `meta`, emits one JSON-ish line at/above the configured level, and
 * (when configured) forwards `warn`/`error` to Sentry. Never throws.
 *
 * Usage:
 *   logger.info("user signed up", { userId });
 *   logger.error("welcome email failed", { error, to });
 */
export const logger = {
  debug: (msg: string, meta?: LogMeta): void => emit("debug", msg, meta),
  info: (msg: string, meta?: LogMeta): void => emit("info", msg, meta),
  warn: (msg: string, meta?: LogMeta): void => emit("warn", msg, meta),
  error: (msg: string, meta?: LogMeta): void => emit("error", msg, meta),
} as const;

/** The logger's type, handy for dependency-injecting a logger into a helper. */
export type Logger = typeof logger;
