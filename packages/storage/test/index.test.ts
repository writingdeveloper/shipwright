import { describe, expect, it } from "vitest";

import { isStorageConfigured } from "../src/index";

describe("isStorageConfigured", () => {
  it("is false when S3 env vars are unset (keyless graceful default)", () => {
    // @repo/env leaves every S3_* var undefined in dev / CI / tests, so storage
    // degrades to the dashboard's "Storage not configured" card rather than
    // attempting an upload against a non-existent bucket.
    expect(isStorageConfigured()).toBe(false);
  });
});
