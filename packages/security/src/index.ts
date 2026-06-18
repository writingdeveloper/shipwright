/**
 * @repo/security — application-layer security primitives for the starter.
 *
 * Today this is a pluggable RATE LIMITER with a backend-agnostic
 * `limit(key) → { success, remaining, reset }` surface:
 * - an IN-MEMORY sliding-window limiter (the default — no deps, no keys, works in
 *   dev/CI/tests and a single instance), and
 * - an UPSTASH (Redis) adapter used ONLY when `UPSTASH_REDIS_REST_URL` +
 *   `UPSTASH_REDIS_REST_TOKEN` are set, for a shared window across instances.
 *
 * Wired into `apps/web/proxy.ts` to throttle brute-force POSTs against the auth
 * endpoints. See `./ratelimit` for the algorithm and `./config` for the backend
 * gate.
 *
 * Also importable via subpaths (`@repo/security/ratelimit`,
 * `@repo/security/config`).
 */

export {
  createRateLimiter,
  InMemoryRateLimiter,
  type RateLimiter,
  type RateLimitOptions,
  type RateLimitResult,
} from "./ratelimit";

export {
  isDistributedRateLimitEnabled,
  upstashCredentials,
} from "./config";
