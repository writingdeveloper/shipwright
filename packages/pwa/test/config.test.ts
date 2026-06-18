import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * config is client-safe: it reads ONLY the public VAPID key (NEXT_PUBLIC_*),
 * never the private one. With no public key set it reports "not configured", so
 * the UI hides/disables push. Env is scrubbed before importing @repo/env so the
 * optional var resolves to undefined deterministically.
 */
const KEYS = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] as const;

beforeEach(() => {
  vi.resetModules();
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => vi.restoreAllMocks());

describe("config (no public VAPID key)", () => {
  it("isPushConfigured() is false and vapidPublicKey() is undefined", async () => {
    const { isPushConfigured, vapidPublicKey } = await import("../src/config");
    expect(isPushConfigured()).toBe(false);
    expect(vapidPublicKey()).toBeUndefined();
  });
});

describe("config (public VAPID key set)", () => {
  it("isPushConfigured() is true and returns the key", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BPublicKey_test";
    const { isPushConfigured, vapidPublicKey } = await import("../src/config");
    expect(isPushConfigured()).toBe(true);
    expect(vapidPublicKey()).toBe("BPublicKey_test");
  });
});
