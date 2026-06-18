/**
 * Vitest setup for `@repo/payments`.
 *
 * `@repo/payments` imports `@repo/env`, whose `createEnv` validates ALL vars
 * (including the required Better Auth / DB server secrets) at import time. A pure
 * unit test has none of those, so we set `SKIP_ENV_VALIDATION` here — before any
 * test module (and thus `@repo/env`) loads — to bypass that validation. The vars
 * this package cares about (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
 * `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PRICE_ID`) are OPTIONAL and read straight
 * from `process.env` under skip, so the no-op / graceful-degradation tests stay
 * accurate: deleting them yields `undefined`, exercising the unconfigured path.
 */
process.env.SKIP_ENV_VALIDATION = "true";

/**
 * Under `SKIP_ENV_VALIDATION`, `@repo/env` does NOT apply its `file:local.db`
 * default for `DATABASE_URL`, so the var is `undefined`. The package's server
 * entry transitively imports `@repo/db`, whose `db` singleton constructs a libSQL
 * client AT IMPORT TIME — which throws on an `undefined` URL. Provide a safe
 * default in-memory URL here so that construction succeeds for the pure
 * graceful-degrade / signature tests (which never query the DB).
 *
 * The DB-backed idempotency test (`handle-webhook.test.ts`) OVERRIDES this with a
 * real migrated temp file via `prepareTestDatabase()` BEFORE its dynamic imports,
 * so it is unaffected by this fallback.
 */
process.env.DATABASE_URL ??= "file::memory:";
