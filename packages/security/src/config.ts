import { env } from "@repo/env";

/**
 * @repo/security — pure configuration for the rate limiter's BACKEND choice.
 *
 * Like the other `@repo/*` config modules this derives a single decision from
 * `@repo/env` with no heavy imports, so it is trivially testable and safe to read
 * anywhere. Here the decision is "do we have a distributed (Upstash Redis)
 * backend, or do we fall back to the in-memory limiter?".
 *
 * GRACEFUL DEGRADATION: the in-memory limiter is the DEFAULT and needs no env and
 * no network — so dev, CI, tests, and a fresh clone all rate-limit correctly with
 * ZERO keys. Upstash is used ONLY when BOTH `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are present.
 */

/** The Upstash REST credentials, or `undefined` when not both configured. */
export function upstashCredentials():
  | { readonly url: string; readonly token: string }
  | undefined {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  return { url, token };
}

/**
 * Is a distributed (Upstash) backend configured? When false the limiter uses the
 * in-memory store. Note: an in-memory limiter is PER-INSTANCE, which is fine for
 * dev/CI/tests and a single serverless instance, but multi-instance production
 * brute-force protection should set the Upstash vars so the window is shared.
 */
export function isDistributedRateLimitEnabled(): boolean {
  return upstashCredentials() !== undefined;
}
