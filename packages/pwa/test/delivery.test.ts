import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * deliverPush sends a payload to each stored subscription via web-push, and
 * reports endpoints that returned 404/410 (gone) so the caller can prune them.
 * web-push is mocked so no real network/crypto runs. Env is scrubbed/reset per
 * test so VAPID presence is deterministic.
 */

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}));

const VAPID = [
  "VAPID_PRIVATE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_SUBJECT",
] as const;

beforeEach(() => {
  vi.resetModules();
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  for (const k of VAPID) delete process.env[k];
});
afterEach(() => vi.restoreAllMocks());

const sub = (endpoint: string) => ({ endpoint, p256dh: "p", auth: "a" });

describe("deliverPush (no VAPID keys)", () => {
  it("returns { configured: false }, warns once, sends nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deliverPush } = await import("../src/push/delivery");

    const result = await deliverPush([sub("https://x/1")], { title: "Hi" });

    expect(result).toEqual({
      configured: false,
      reason: "VAPID keys are not set",
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("deliverPush (VAPID configured)", () => {
  beforeEach(() => {
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
  });

  it("sends to every subscription and counts successes", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { deliverPush } = await import("../src/push/delivery");

    const result = await deliverPush([sub("https://x/1"), sub("https://x/2")], {
      title: "Hi",
      body: "There",
    });

    expect(setVapidDetails).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ configured: true, sent: 2, deadEndpoints: [] });
  });

  it("collects 404/410 endpoints as dead (to be pruned) and still counts live sends", async () => {
    sendNotification
      .mockResolvedValueOnce({ statusCode: 201 }) // live
      .mockRejectedValueOnce(
        Object.assign(new Error("gone"), { statusCode: 410 }),
      ); // dead
    const { deliverPush } = await import("../src/push/delivery");

    const result = await deliverPush([sub("https://live"), sub("https://dead")], {
      title: "Hi",
    });

    expect(result).toEqual({
      configured: true,
      sent: 1,
      deadEndpoints: ["https://dead"],
    });
  });
});
