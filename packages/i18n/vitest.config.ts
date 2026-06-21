import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@repo/i18n`. Pure, account-free checks: the routing config
 * shape (locales / defaultLocale / localePrefix). The en/ko message-key drift
 * guard lives alongside the messages in the app (Task 2). `environment: "node"`
 * — routing is plain config, no DOM.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
