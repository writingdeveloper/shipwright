/**
 * Vitest setup for `@repo/api`. The router's context imports `@repo/auth` /
 * `@repo/db`, which import `@repo/env` (validates required secrets at load). Skip
 * that for unit tests, and give `@repo/db` a safe in-memory URL so its client
 * constructs (the guard test never queries it).
 */
process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL ??= "file::memory:";
