import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Resend so the "with key" reply-to test never makes a network call.
// `new Resend(key)` is a constructor, so the mock must be a class (an arrow
// function has no [[Construct]] and would throw "is not a constructor").
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

/**
 * Graceful-degradation guard for the send helpers.
 *
 * These run with NO Resend account (the repo invariant): `RESEND_API_KEY` and
 * `EMAIL_FROM` are deleted from the environment BEFORE `@repo/env` is imported,
 * so the helper must take its no-op branch — log once, return `{ skipped: true }`,
 * and never throw or make a network call. This is the unit mirror of the e2e,
 * which signs up repeatedly with no key set.
 *
 * The module is imported dynamically AFTER the env is scrubbed (and reset
 * between tests) so the OPTIONAL vars resolve to `undefined` deterministically,
 * regardless of the developer's real shell env.
 */

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendWelcomeEmail (no Resend key)", () => {
  it("no-ops and returns a skipped result without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendWelcomeEmail } = await import("../src/send");

    const result = await sendWelcomeEmail({
      to: "user@example.com",
      name: "Ada",
    });

    expect(result).toEqual({
      skipped: true,
      reason: "RESEND_API_KEY is not set",
    });
    // The single operational warning was emitted (and points at the missing var).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("RESEND_API_KEY");
  });

  it("warns at most once across repeated sends (latched)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendWelcomeEmail } = await import("../src/send");

    await sendWelcomeEmail({ to: "a@example.com", name: "A" });
    await sendWelcomeEmail({ to: "b@example.com", name: "B" });
    await sendWelcomeEmail({ to: "c@example.com", name: "C" });

    // Skipped every time, but the warning is latched to one line for clean logs.
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("sendEmail (no Resend key)", () => {
  it("skips with the EMAIL_FROM reason when only the key is the issue path", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail, WelcomeEmail } = await import("../src/index");
    const { createElement } = await import("react");

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Hi",
      react: createElement(WelcomeEmail, { name: "Ada" }),
    });

    expect(result.skipped).toBe(true);
  });
});

describe("sendEmail forwards replyTo (with key, Resend mocked)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Acme <noreply@acme.com>";
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "e1" }, error: null });
  });

  it("passes replyTo through to resend.emails.send", async () => {
    const { sendEmail, WelcomeEmail } = await import("../src/index");
    const { createElement } = await import("react");

    await sendEmail({
      to: "user@example.com",
      subject: "Hi",
      react: createElement(WelcomeEmail, { name: "Ada" }),
      replyTo: "support@acme.com",
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "support@acme.com" }),
    );
  });
});

describe("sendPasswordResetEmail / sendVerificationEmail (no Resend key)", () => {
  it("both no-op and return a skipped result without keys", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendPasswordResetEmail, sendVerificationEmail } = await import(
      "../src/send"
    );

    const r1 = await sendPasswordResetEmail({
      to: "a@example.com",
      url: "https://x.com/reset?token=t",
    });
    const r2 = await sendVerificationEmail({
      to: "a@example.com",
      url: "https://x.com/verify?token=t",
    });

    expect(r1.skipped).toBe(true);
    expect(r2.skipped).toBe(true);
  });
});
