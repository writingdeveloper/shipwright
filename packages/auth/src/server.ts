import { db, schema } from "@repo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Server-side Better Auth instance.
 *
 * - Drizzle adapter (libSQL/SQLite provider) pointed at `@repo/db`.
 * - Email + password enabled; email verification disabled (deterministic for
 *   tests — users can sign in immediately after sign-up).
 *
 * Reads `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from the environment.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
});

export type Auth = typeof auth;
export type Session = Auth["$Infer"]["Session"];
