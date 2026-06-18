import { upstashCredentials } from "./config";

/**
 * @repo/security — a pluggable rate limiter with a tiny, stable surface.
 *
 * `RateLimiter.limit(key)` → `{ success, remaining, reset }`. Two backends behind
 * the SAME interface:
 *
 * - IN-MEMORY (default): a sliding-window counter kept in a `Map`, needing NO
 *   dependencies and NO keys, so it works in dev, CI, tests, and a single
 *   serverless instance out of the box. This is what the e2e and a fresh clone
 *   use.
 * - UPSTASH (opt-in): a Redis-backed `@upstash/ratelimit` sliding window, used
 *   ONLY when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, so a
 *   multi-instance production deployment shares one window across instances. The
 *   `@upstash/*` packages are imported LAZILY (dynamic import) inside the adapter
 *   so they never load — and never need to exist at runtime — on the in-memory
 *   path.
 *
 * The algorithm is a SLIDING WINDOW: a request at time `t` is allowed iff fewer
 * than `limit` requests fall within `[t - window, t]`. This avoids the burst at a
 * fixed-window boundary (where 2×limit requests can slip through across the
 * edge) while staying O(1) amortised per key.
 */

/** The outcome of a single {@link RateLimiter.limit} check. */
export type RateLimitResult = {
  /** Whether this request is allowed (within the limit). */
  readonly success: boolean;
  /** Requests still allowed in the current window after this one. */
  readonly remaining: number;
  /** Epoch ms at which the window frees up enough for the next request. */
  readonly reset: number;
  /** The configured maximum requests per window (echoed for callers/headers). */
  readonly limit: number;
};

/** The backend-agnostic limiter interface the app codes against. */
export type RateLimiter = {
  /** Check-and-consume one unit for `key` (e.g. a client IP). Never throws. */
  readonly limit: (key: string) => Promise<RateLimitResult>;
};

/** Options shared by both backends. */
export type RateLimitOptions = {
  /** Max requests permitted per sliding window. Must be ≥ 1. */
  readonly limit: number;
  /** Window length in milliseconds. Must be > 0. */
  readonly windowMs: number;
  /**
   * Namespace prefix so multiple independent limiters (auth, an expensive
   * action, …) don't share counters. Defaults to `"rl"`.
   */
  readonly prefix?: string;
};

/**
 * In-memory sliding-window limiter.
 *
 * Per key we keep the timestamps of the requests inside the current window. On
 * each call we drop timestamps older than `now - windowMs`, then allow the
 * request iff the remaining count is below `limit`. A periodic sweep (triggered
 * lazily on access) evicts stale keys so the Map can't grow unbounded.
 *
 * Exported (not just the factory) so it can be instantiated directly and
 * unit-tested deterministically with an injectable clock.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly limitCount: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimitOptions & { readonly now?: () => number }) {
    if (options.limit < 1) throw new Error("limit must be >= 1");
    if (options.windowMs <= 0) throw new Error("windowMs must be > 0");
    this.limitCount = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  limit(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const windowStart = now - this.windowMs;

    // Keep only timestamps within the current window.
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.limitCount) {
      // Blocked: the window frees up when the OLDEST in-window hit ages out.
      const oldest = recent[0]!;
      const reset = oldest + this.windowMs;
      this.hits.set(key, recent);
      this.maybeSweep(now);
      return Promise.resolve({
        success: false,
        remaining: 0,
        reset,
        limit: this.limitCount,
      });
    }

    // Allowed: record this hit.
    recent.push(now);
    this.hits.set(key, recent);
    this.maybeSweep(now);

    return Promise.resolve({
      success: true,
      remaining: this.limitCount - recent.length,
      reset: now + this.windowMs,
      limit: this.limitCount,
    });
  }

  // Opportunistically evict keys whose newest hit is already out of any window,
  // bounding memory without a timer. Runs at most once per window per instance.
  private lastSweep = 0;
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      const newest = timestamps[timestamps.length - 1];
      if (newest === undefined || newest <= cutoff) {
        this.hits.delete(key);
      }
    }
  }
}

/**
 * Upstash (Redis) adapter. Lazily constructs a `@upstash/ratelimit` sliding
 * window on first use, so the `@upstash/*` modules are only loaded when the
 * credentials exist. Wrapped so a transient Redis/network error FAILS OPEN
 * (allows the request) rather than turning the limiter into an outage — a rate
 * limiter must never be a single point of failure for sign-in.
 */
class UpstashRateLimiter implements RateLimiter {
  private readonly limitCount: number;
  private readonly windowMs: number;
  private readonly prefix: string;
  private readonly creds: { url: string; token: string };
  // Lazily-initialised upstash limiter (typed loosely to avoid a hard type dep
  // here; the dynamic import provides the real implementation).
  private impl: { limit: (key: string) => Promise<unknown> } | undefined;

  constructor(
    options: RateLimitOptions,
    creds: { url: string; token: string },
  ) {
    this.limitCount = options.limit;
    this.windowMs = options.windowMs;
    this.prefix = options.prefix ?? "rl";
    this.creds = creds;
  }

  private async getImpl() {
    if (this.impl) return this.impl;
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import("@upstash/ratelimit"),
      import("@upstash/redis"),
    ]);
    const redis = new Redis({ url: this.creds.url, token: this.creds.token });
    this.impl = new Ratelimit({
      redis,
      // Express the window in seconds for the Upstash Duration string.
      limiter: Ratelimit.slidingWindow(
        this.limitCount,
        `${Math.max(1, Math.round(this.windowMs / 1000))} s`,
      ),
      prefix: this.prefix,
      analytics: false,
    });
    return this.impl;
  }

  async limit(key: string): Promise<RateLimitResult> {
    try {
      const impl = await this.getImpl();
      const res = (await impl.limit(key)) as {
        success: boolean;
        remaining: number;
        reset: number;
        limit: number;
      };
      return {
        success: res.success,
        remaining: res.remaining,
        reset: res.reset,
        limit: res.limit,
      };
    } catch {
      // Fail open: never let a Redis hiccup block legitimate traffic.
      return {
        success: true,
        remaining: this.limitCount,
        reset: Date.now() + this.windowMs,
        limit: this.limitCount,
      };
    }
  }
}

/**
 * Build a {@link RateLimiter}, choosing the backend automatically:
 * Upstash when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set,
 * otherwise the dependency-free in-memory limiter. The returned limiter has the
 * same `limit(key)` API regardless, so callers (e.g. the proxy) are agnostic.
 *
 * Construct ONE per limiter purpose at module scope and reuse it, so the
 * in-memory window (and the Upstash client) persist across requests within an
 * instance.
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const creds = upstashCredentials();
  if (creds) {
    return new UpstashRateLimiter(options, creds);
  }
  return new InMemoryRateLimiter(options);
}
