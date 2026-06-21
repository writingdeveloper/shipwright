# @repo/storage — Claude Code rules

S3-compatible object storage (Cloudflare R2 / AWS S3 / MinIO) via presigned URLs. Built on `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

- **server-only**: reads the `S3_*` secrets from `@repo/env` (which OWNS those vars — never re-declare them elsewhere). Never import this package from client code.
- **Always guard callers with `isStorageConfigured()`** — the presigned/delete helpers throw if called while unconfigured (any `S3_*` var unset). Keyless ⇒ the dashboard shows a "Storage not configured" card, so the app, tests, and CI run with no bucket.
- The `S3Client` is a lazy module singleton (constructed on first use). Presigned URL TTL defaults to 600s; pass `expiresIn` to override per call.
- **Owner-scope every object**: keys are namespaced by `userId` (`<userId>/<uuid>-<name>`); the Server Action re-checks the prefix on save so a forged key can't attach another user's object. The `uploaded_file` table (`@repo/db`) holds the owner-scoped metadata; deleting a row also deletes the object (best-effort).
- NOT listed in `apps/web` `transpilePackages` — it's server-only and the aws-sdk stays external to the bundle.
