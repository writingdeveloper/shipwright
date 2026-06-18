/**
 * Vitest setup for `@repo/security`.
 *
 * The in-memory limiter under test does not import `@repo/env`, but the package's
 * `config`/`index` do. Setting `SKIP_ENV_VALIDATION` before any module loads
 * keeps a future test that imports the index from tripping `@repo/env`'s required
 * Better Auth / DB validation, exactly as the other packages' setups do.
 */
process.env.SKIP_ENV_VALIDATION = "true";
