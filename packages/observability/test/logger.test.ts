import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards for the always-on structured logger: it emits one JSON-ish line at the
 * right `console` method, includes level + msg + meta, honours the minimum level,
 * never throws on awkward input, and forwards warn/error to a registered Sentry
 * bridge (the no-DSN path simply never registers one).
 *
 * `LOG_LEVEL` is forced to `debug` and modules are reset per test so the
 * module-load-time level resolution is deterministic.
 */

beforeEach(() => {
  vi.resetModules();
  process.env.LOG_LEVEL = "debug";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe("structured logger", () => {
  it("emits info as a single JSON line with level, msg and meta", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("../src/logger");

    logger.info("hello", { userId: "u1" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(parsed.userId).toBe("u1");
    expect(typeof parsed.time).toBe("string");
  });

  it("routes warn to console.warn and error to console.error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = await import("../src/logger");

    logger.warn("careful");
    logger.error("boom");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0]![0] as string).level).toBe("warn");
    expect(JSON.parse(error.mock.calls[0]![0] as string).level).toBe("error");
  });

  it("suppresses levels below the configured minimum", async () => {
    process.env.LOG_LEVEL = "warn";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logger } = await import("../src/logger");

    logger.info("dropped");
    logger.debug("dropped");
    logger.warn("kept");

    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("never throws on circular meta", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await import("../src/logger");

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.info("circular", circular)).not.toThrow();
  });

  it("forwards warn/error to a registered Sentry bridge", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, setSentryBridge } = await import("../src/logger");

    const captureMessage = vi.fn();
    const captureException = vi.fn();
    setSentryBridge({ captureMessage, captureException });

    logger.warn("warn-to-sentry");
    const err = new Error("kaboom");
    logger.error("error-to-sentry", { error: err });

    expect(captureMessage).toHaveBeenCalledWith(
      "warn-to-sentry",
      "warn",
      undefined,
    );
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ msg: "error-to-sentry" }),
    );

    // Clear the bridge so it can't leak into other tests in the file.
    setSentryBridge(undefined);
  });

  it("does not forward when no bridge is registered (the no-DSN path)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, setSentryBridge } = await import("../src/logger");
    setSentryBridge(undefined);

    // Just asserting it runs without a bridge and does not throw.
    expect(() => logger.error("no bridge")).not.toThrow();
  });
});
