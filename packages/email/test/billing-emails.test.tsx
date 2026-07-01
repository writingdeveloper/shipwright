import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { PaymentFailedEmail } from "../src/payment-failed-email";

describe("billing email templates", () => {
  it("PaymentFailedEmail renders the billing CTA url + app name", async () => {
    const html = await render(
      createElement(PaymentFailedEmail, {
        billingUrl: "https://x.com/dashboard",
        appName: "Shipwright",
      }),
    );
    expect(html).toContain("<!DOCTYPE");
    expect(html).toContain("https://x.com/dashboard");
    expect(html).toContain("Shipwright");
    expect(html).toContain("Update payment method");
  });
});
