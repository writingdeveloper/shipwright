import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Centralised, type-safe environment schema for shipwright.
 *
 * Validation schemas live in the package that owns the variables and each app
 * composes them in a root `env.ts` (the repo's Env rule). Today every secret is
 * owned by `@repo/auth` / `@repo/db`, so the single source of truth lives here
 * and those packages import the parsed `env` instead of reaching into
 * `process.env`. As new packages introduce their own vars, give each its own
 * schema and merge with t3-env's `extends`.
 *
 * Behaviour:
 * - Parsed once at module load; a missing/invalid required var throws a clear,
 *   aggregated error *before* the app serves a request (fail fast, not at the
 *   first 500).
 * - `SKIP_ENV_VALIDATION` bypasses parsing so a build/CI step without real
 *   secrets (e.g. `next build` for type-checking) doesn't fail. NEVER set it
 *   where the app actually runs.
 * - `emptyStringAsUndefined` treats `FOO=` in a `.env` file as "unset", so an
 *   empty line falls through to a default / required error instead of silently
 *   passing an empty string.
 */
export const env = createEnv({
  /**
   * Server-only variables. Accessing any of these from client code is a
   * compile-time error via t3-env.
   */
  server: {
    // Better Auth signing secret. Better Auth itself rejects short secrets;
    // we mirror that as a 32-char floor with an actionable message.
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters."),
    // Canonical origin Better Auth issues/validates callbacks against.
    BETTER_AUTH_URL: z.string().url(),
    // libSQL connection string. Defaults to a local file so a fresh clone runs
    // with zero config; override for Turso/remote libSQL.
    DATABASE_URL: z.string().min(1).default("file:local.db"),
    // Optional auth token for remote libSQL (Turso). Unset for local files.
    DATABASE_AUTH_TOKEN: z.string().optional(),
  },

  /**
   * Client-exposed variables. Must be prefixed `NEXT_PUBLIC_` and are inlined
   * into the browser bundle, so never put a secret here.
   */
  client: {
    // Optional explicit base URL for the browser auth client. When unset the
    // client falls back to same-origin, which is correct for the default
    // single-app deployment.
    NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
  },

  /**
   * Next.js inlines `NEXT_PUBLIC_*` at build time, so client vars must be
   * destructured explicitly from `process.env` (a bare `process.env` is not
   * statically analysable). Server vars are read from `process.env` directly.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  },

  /**
   * Skip parsing when explicitly opted out (CI builds, lint/type-only steps
   * that have no real secrets). Off by default so a normal run validates.
   */
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION &&
    process.env.SKIP_ENV_VALIDATION !== "false",

  /**
   * Treat empty strings (`FOO=`) as undefined so they hit defaults / required
   * checks rather than passing as a valid empty value.
   */
  emptyStringAsUndefined: true,
});
