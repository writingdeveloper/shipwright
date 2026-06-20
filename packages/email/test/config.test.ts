import { describe, expect, it } from "vitest";

import { isEmailConfigured } from "../src/config";

describe("isEmailConfigured", () => {
  it("is false when no RESEND_API_KEY/EMAIL_FROM (the keyless default)", () => {
    // The test env sets neither, so email is unconfigured — the value that keeps
    // requireEmailVerification off on CI/e2e.
    expect(isEmailConfigured()).toBe(false);
  });
});
