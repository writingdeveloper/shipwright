/**
 * Vitest setup for `@repo/email`.
 *
 * `@repo/email/send` imports `@repo/env`, whose `createEnv` validates ALL vars
 * (including the required Better Auth / DB server secrets) at import time. A pure
 * unit test has none of those, so we set `SKIP_ENV_VALIDATION` here — before any
 * test module (and thus `@repo/env`) loads — to bypass that validation. The vars
 * this package cares about (`RESEND_API_KEY`, `EMAIL_FROM`) are OPTIONAL and
 * read straight from `process.env` under skip, so the no-op tests stay accurate:
 * deleting them yields `undefined`, exercising the graceful-degradation path.
 */
process.env.SKIP_ENV_VALIDATION = "true";
