import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { PasswordResetEmail } from "../src/password-reset-email";
import { VerifyEmail } from "../src/verify-email";

describe("auth email templates", () => {
  it("PasswordResetEmail renders the CTA url + app name", async () => {
    const html = await render(
      createElement(PasswordResetEmail, {
        url: "https://x.com/reset-password?token=abc",
        appName: "Shipwright",
      }),
    );
    expect(html).toContain("<!DOCTYPE");
    expect(html).toContain("https://x.com/reset-password?token=abc");
    expect(html).toContain("Shipwright");
  });

  it("VerifyEmail renders the CTA url", async () => {
    const html = await render(
      createElement(VerifyEmail, {
        url: "https://x.com/verify?token=abc",
        appName: "Shipwright",
      }),
    );
    expect(html).toContain("https://x.com/verify?token=abc");
  });
});
