/**
 * Vitest setup for `@repo/storage`.
 *
 * `@repo/storage` imports `@repo/env`, whose `createEnv` validates ALL vars
 * (including the required Better Auth / DB server secrets) at import time. A pure
 * unit test has none of those, so we set `SKIP_ENV_VALIDATION` here — before any
 * test module (and thus `@repo/env`) loads — to bypass that validation. The
 * S3_* vars this package reads are OPTIONAL and read straight from `process.env`
 * under skip, so the graceful-default test stays accurate: unset ⇒
 * `isStorageConfigured()` === false.
 */
process.env.SKIP_ENV_VALIDATION = "true";
