import { createRateLimiter } from "@repo/security/ratelimit";
import { logger } from "@repo/observability/logger";

/**
 * Per-user rate limits for the dashboard's Server Actions.
 *
 * The proxy limits `/api/auth/*` by IP (pre-auth traffic); these limit the
 * AUTHENTICATED mutations by userId — an abusive session can't spam task
 * writes, presigned-upload mints, push sends, or Stripe session creation just
 * because it holds a valid cookie. Keyed by userId (not IP) so NAT'd users
 * never share a bucket and a single account can't dodge the limit by rotating
 * IPs.
 *
 * One limiter per purpose at module scope (the window must persist across
 * requests within an instance — see `createRateLimiter`); Upstash-backed when
 * configured, in-memory otherwise, like the auth limiter.
 *
 * Ceilings are far above any human rate (so the e2e and real users never trip
 * them) but bound scripted abuse:
 * - `task`: 60/min — createTask/toggleTask/deleteTask.
 * - `file`: 20/min — presigned-URL mints + deletes (each mint permits a PUT of
 *   up to 10 MB, so this also caps upload bandwidth; `saveFileRecord` is not
 *   limited because it is already bounded by the tickets this mints).
 * - `push`: 10/min — sendTestPush fans out real network sends per subscription.
 * - `billing`: 5/min — each call creates a Stripe Checkout/Portal session.
 */
const LIMITERS = {
  task: createRateLimiter({ limit: 60, windowMs: 60_000, prefix: "act-task" }),
  file: createRateLimiter({ limit: 20, windowMs: 60_000, prefix: "act-file" }),
  push: createRateLimiter({ limit: 10, windowMs: 60_000, prefix: "act-push" }),
  billing: createRateLimiter({
    limit: 5,
    windowMs: 60_000,
    prefix: "act-billing",
  }),
} as const;

export type ActionLimitKind = keyof typeof LIMITERS;

/**
 * Check-and-consume one unit of `kind` for this user. Returns whether the call
 * is allowed; a block is logged here (once per offending call) so callers only
 * decide the user-facing shape (inline error / silent no-op / redirect).
 */
export async function allowAction(
  kind: ActionLimitKind,
  userId: string,
): Promise<boolean> {
  const { success, reset } = await LIMITERS[kind].limit(userId);
  if (!success) {
    logger.warn("action rate limit exceeded", {
      kind,
      userId,
      retryAfterMs: Math.max(0, reset - Date.now()),
    });
  }
  return success;
}
