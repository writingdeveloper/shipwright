/**
 * Vitest setup for `@repo/analytics`.
 *
 * `../src/config` imports `@repo/env`, whose `createEnv` validates ALL vars
 * (including the required Better Auth / DB server secrets) at import time. A pure
 * config unit test has none of those, so we set `SKIP_ENV_VALIDATION` here —
 * before any test module (and thus `@repo/env`) loads — to bypass that
 * validation. The analytics vars (`NEXT_PUBLIC_POSTHOG_KEY`/`_HOST`) are OPTIONAL
 * and read straight from `process.env` under skip, so setting/deleting them per
 * test deterministically drives the enabled / no-op branches.
 */
process.env.SKIP_ENV_VALIDATION = "true";
