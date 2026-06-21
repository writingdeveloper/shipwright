import { describe, expect, it } from "vitest";

import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteObject,
  isStorageConfigured,
} from "../src/index";

describe("isStorageConfigured", () => {
  it("is false when S3 env vars are unset (keyless graceful default)", () => {
    // @repo/env leaves every S3_* var undefined in dev / CI / tests, so storage
    // degrades to the dashboard's "Storage not configured" card rather than
    // attempting an upload against a non-existent bucket.
    expect(isStorageConfigured()).toBe(false);
  });
});

describe("unconfigured storage — error paths", () => {
  it("createPresignedUploadUrl rejects with 'not configured' when S3 vars are unset", async () => {
    await expect(
      createPresignedUploadUrl({ key: "test.txt", contentType: "text/plain" }),
    ).rejects.toThrow(/not configured/i);
  });

  it("createPresignedDownloadUrl rejects with 'not configured' when S3 vars are unset", async () => {
    await expect(createPresignedDownloadUrl("test.txt")).rejects.toThrow(
      /not configured/i,
    );
  });

  it("deleteObject rejects with 'not configured' when S3 vars are unset", async () => {
    await expect(deleteObject("test.txt")).rejects.toThrow(/not configured/i);
  });
});
