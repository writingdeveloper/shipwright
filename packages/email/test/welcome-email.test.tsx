import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { WelcomeEmail } from "../src/welcome-email";

/**
 * The template is pure (no env, no network), so it renders to HTML in a plain
 * node test. This pins that the parameters (name/appName) actually reach the
 * output and that an action URL becomes a real link when provided.
 */

describe("WelcomeEmail", () => {
  it("renders to an HTML document containing the name and app name", async () => {
    const html = await render(
      createElement(WelcomeEmail, { name: "Ada", appName: "Shipwright" }),
    );

    expect(html).toContain("<!DOCTYPE");
    expect(html).toContain("Ada");
    expect(html).toContain("Shipwright");
  });

  it("falls back to safe defaults when no props are given", async () => {
    const html = await render(createElement(WelcomeEmail, {}));
    expect(html).toContain("there");
    expect(html).toContain("our app");
  });

  it("includes the CTA link only when actionUrl is provided", async () => {
    const withUrl = await render(
      createElement(WelcomeEmail, {
        appName: "Shipwright",
        actionUrl: "https://example.com/dashboard",
      }),
    );
    expect(withUrl).toContain("https://example.com/dashboard");

    const withoutUrl = await render(
      createElement(WelcomeEmail, { appName: "Shipwright" }),
    );
    expect(withoutUrl).not.toContain("https://example.com/dashboard");
  });
});
