/**
 * App-level environment composition.
 *
 * The schemas themselves live in the package that owns each variable
 * (`@repo/env`, fed by `@repo/auth` / `@repo/db`); the app just re-exports the
 * parsed, type-safe `env` so application code has a single import and a single
 * place validation is triggered. Importing this module from `next.config.js`
 * makes `next build` / `next dev` fail fast on a missing or malformed variable
 * (unless `SKIP_ENV_VALIDATION` is set).
 *
 * As the app grows app-only variables, define them here with t3-env's
 * `extends: [env]` instead of polluting the shared package schema.
 */
export { env } from "@repo/env";
