import { describe, expect, it } from "vitest";

import { routing } from "../src/routing";

describe("routing", () => {
  it("declares en + ko with en as the prefix-free default", () => {
    // en first + defaultLocale="en" + "as-needed" is what keeps existing URLs
    // (and the 40 e2e) unchanged while /ko gets its own indexable URLs.
    expect(routing.locales).toEqual(["en", "ko"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("as-needed");
  });
});
