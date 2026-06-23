import { describe, expect, it } from "vitest";

import { createRouting } from "../src/routing";

/**
 * The factory is the package's contract. The locale POLICY (which locales exist)
 * + its drift-guard now live in the app (`apps/web/i18n/routing.ts` +
 * `apps/web/tests/messages.test.ts`); here we only assert the factory builds a
 * routing config the app can rely on.
 */
describe("createRouting", () => {
  it("builds a routing config, passing locales / defaultLocale / localePrefix through", () => {
    const routing = createRouting({
      locales: ["en", "ko"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });
    expect(routing.locales).toEqual(["en", "ko"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("as-needed");
  });
});
