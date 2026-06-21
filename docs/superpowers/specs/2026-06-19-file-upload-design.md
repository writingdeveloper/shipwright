# File Upload (S3-compatible + presigned) — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorm)

## Goal

Owner-scoped file upload to S3-compatible storage (R2/S3/MinIO) via presigned
PUT, **graceful**: keyless → a "not configured" card, existing flows intact.

## Design

### env (`@repo/env`, all optional → graceful)
`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`.
Add the 5 to `turbo.json` globalEnv + `.env.example`.

### `@repo/storage` (new package)
- `isStorageConfigured(): boolean` — all 5 vars set (client-safe? no — server-only, reads secrets).
- `createPresignedUploadUrl({ key, contentType }): Promise<string>` — presigned PUT.
- `createPresignedDownloadUrl(key): Promise<string>` — presigned GET.
- `deleteObject(key): Promise<void>`.
- Built on `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (vetted). The
  three URL/delete helpers throw if not configured; callers guard with
  `isStorageConfigured()`.

### `@repo/db`
- `uploadedFile` table: `id` (uuid pk), `userId` (fk), `key` (unique), `name`,
  `size` (int), `contentType`, `createdAt`. Owner-scoped like `task`.

### `apps/web` (dashboard)
- `file-actions.ts` (server, `requireUserId`): `requestUploadUrl(name, contentType)`
  → `{ key, url }` (key namespaced by userId); `saveFileRecord(key, name, size,
  contentType)`; `listFiles()`; `deleteFile(id)` (owner-scoped + `deleteObject`).
- `file-upload.tsx` (client): pick file → `requestUploadUrl` → `fetch(url, { method: "PUT", body })`
  → `saveFileRecord` → refresh.
- `FilesCard`: `isStorageConfigured()` ? upload + list (download via presigned GET)
  : a "Storage not configured" note (mirrors the billing/push cards).

### graceful + e2e
- keyless: `isStorageConfigured() === false` → "not configured" card → no upload
  → existing 40 e2e intact.
- new e2e: keyless dashboard shows the "Storage not configured" note; axe clean.

### Verification (detailed QA)
- **unit**: `@repo/storage` `isStorageConfigured` (keyless false); db owner-scope
  test for `uploadedFile` (mirrors task-ownership).
- **e2e**: keyless Files card "not configured"; existing 40 preserved; axe.
- **gate**: check-types (aws-sdk + db schema + actions), lint, test, build.

## Out of scope (YAGNI)

- Image transforms, multipart upload, and a real S3 round-trip e2e (needs real
  bucket credentials — deployment-time check).

## Risks / notes

- `@aws-sdk/s3-request-presigner` API; `db:push` must apply the `uploadedFile`
  table; `turbo.json` globalEnv must list the 5 vars (lint).
- `serverExternalPackages` in `apps/web/next.config.ts` may need the aws-sdk if
  bundling complains (verify at build).
