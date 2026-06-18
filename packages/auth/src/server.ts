import { db, schema } from "@repo/db";
import { sendWelcomeEmail } from "@repo/email";
import { env } from "@repo/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Server-side Better Auth instance.
 *
 * - Drizzle adapter (libSQL/SQLite provider) pointed at `@repo/db`.
 * - Email + password enabled; email verification disabled (deterministic for
 *   tests — users can sign in immediately after sign-up).
 * - A `databaseHooks.user.create.after` hook fires the welcome email so it is
 *   automatic for every sign-up path (no per-form wiring). See the hook note.
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
  databaseHooks: {
    user: {
      create: {
        // Runs AFTER a user row is committed — the right place for a side effect
        // that must not block or roll back account creation. `sendWelcomeEmail`
        // already no-ops (returns `{ skipped: true }`, never throws) when Resend
        // is unconfigured, so this is a transparent no-op in tests/CI/local dev
        // with no key. We still fire-and-forget with a `.catch()` so even an
        // unexpected error can never reject the sign-up request, and we do not
        // `await` it so email latency never slows the response.
        after: async (user) => {
          void sendWelcomeEmail({
            to: user.email,
            name: user.name,
            actionUrl: env.BETTER_AUTH_URL,
          }).catch(() => {
            // Swallowed by design: email is best-effort and must never break
            // sign-up. `sendWelcomeEmail` logs its own operational errors.
          });
        },
      },
    },
  },
});

export type Auth = typeof auth;
export type Session = Auth["$Infer"]["Session"];
