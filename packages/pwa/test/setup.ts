/**
 * Vitest setup for `@repo/pwa`.
 *
 * `@repo/pwa` imports `@repo/env`, whose `createEnv` validates ALL vars at import
 * time (including the required Better Auth / DB secrets a pure unit test lacks).
 * Set `SKIP_ENV_VALIDATION` here — before any test module (and thus `@repo/env`)
 * loads — to bypass that validation. The VAPID vars this package cares about are
 * OPTIONAL and read straight from `process.env` under skip, so the no-op /
 * graceful-degradation tests stay accurate: deleting them yields `undefined`,
 * exercising the unconfigured path.
 */
process.env.SKIP_ENV_VALIDATION = "true";

/**
 * Under `SKIP_ENV_VALIDATION`, `@repo/env` does NOT apply its `file:local.db`
 * default for `DATABASE_URL`. The server push module (`./push/delivery`,
 * `./push/server`) transitively imports `@repo/db` / `@repo/observability`, whose
 * singletons construct at import time. Provide a safe in-memory URL so that
 * construction succeeds for the pure delivery tests (which never query the DB).
 */
process.env.DATABASE_URL ??= "file::memory:";
