import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter } from "../src/ratelimit";

/**
 * The contract the auth brute-force guard relies on: the in-memory sliding-window
 * limiter allows exactly up to `limit` requests within a window, blocks the next,
 * and frees up once the window has slid past the earliest hit. A mutable fake
 * clock makes every assertion deterministic with no real time.
 */

function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("InMemoryRateLimiter", () => {
  it("allows up to the limit, then blocks the next request", async () => {
    const clock = fakeClock();
    const rl = new InMemoryRateLimiter({
      limit: 3,
      windowMs: 10_000,
      now: clock.now,
    });

    const r1 = await rl.limit("ip");
    const r2 = await rl.limit("ip");
    const r3 = await rl.limit("ip");
    const r4 = await rl.limit("ip");

    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);

    // The 4th within the window is blocked.
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.limit).toBe(3);
  });

  it("resets once the window slides past the earliest hit", async () => {
    const clock = fakeClock();
    const rl = new InMemoryRateLimiter({
      limit: 2,
      windowMs: 10_000,
      now: clock.now,
    });

    await rl.limit("ip"); // t=0
    await rl.limit("ip"); // t=0
    expect((await rl.limit("ip")).success).toBe(false); // blocked at t=0

    // Advance to just before the first hit ages out — still blocked.
    clock.advance(10_000);
    // At exactly windowMs later the first two hits (t=0) are no longer > windowStart.
    const afterWindow = await rl.limit("ip");
    expect(afterWindow.success).toBe(true);
  });

  it("keeps separate windows per key", async () => {
    const clock = fakeClock();
    const rl = new InMemoryRateLimiter({
      limit: 1,
      windowMs: 5_000,
      now: clock.now,
    });

    expect((await rl.limit("a")).success).toBe(true);
    expect((await rl.limit("a")).success).toBe(false);
    // A different key has its own fresh budget.
    expect((await rl.limit("b")).success).toBe(true);
  });

  it("partially refills as individual hits expire in a sliding window", async () => {
    const clock = fakeClock();
    const rl = new InMemoryRateLimiter({
      limit: 2,
      windowMs: 10_000,
      now: clock.now,
    });

    await rl.limit("ip"); // t=0
    clock.advance(5_000);
    await rl.limit("ip"); // t=5000 → window full (2 hits)
    expect((await rl.limit("ip")).success).toBe(false);

    // Advance so ONLY the first hit (t=0) ages out; the t=5000 hit remains.
    clock.advance(5_001); // now t=10_001, windowStart=1 → drops t=0, keeps t=5000
    const refilled = await rl.limit("ip");
    expect(refilled.success).toBe(true);
    // One slot was reclaimed and immediately consumed → none remaining.
    expect(refilled.remaining).toBe(0);
  });

  it("validates its options", () => {
    expect(() => new InMemoryRateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new InMemoryRateLimiter({ limit: 1, windowMs: 0 })).toThrow();
  });
});
