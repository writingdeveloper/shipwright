import { db, schema } from "@repo/db";
import { env } from "@repo/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Server-side Better Auth instance.
 *
 * - Drizzle adapter (libSQL/SQLite provider) pointed at `@repo/db`.
 * - Email + password enabled; email verification disabled (deterministic for
 *   tests — users can sign in immediately after sign-up).
 *
 * `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` come from the validated `@repo/env`
 * schema, so they are guaranteed present and well-formed at startup rather than
 * read raw from `process.env`.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
});

export type Auth = typeof auth;
export type Session = Auth["$Infer"]["Session"];
