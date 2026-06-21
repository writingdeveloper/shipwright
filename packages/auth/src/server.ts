import { db, schema } from "@repo/db";
import {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "@repo/email";
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
    // Dynamic: enforce verification ONLY when email can actually be sent, so the
    // keyless app/CI/e2e (no Resend) still signs in immediately, while a real
    // deployment with email gates sign-in on a verified address.
    requireEmailVerification: isEmailConfigured(),
    // Better Auth calls this with the tokenised reset URL; we email it. Graceful:
    // sendPasswordResetEmail no-ops without Resend config.
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, url });
    },
  },
  // Register a provider ONLY when its public clientId + secret are both set, so
  // the keyless app/tests/CI have no social login (graceful). clientId is public;
  // the secret stays server-side.
  socialProviders: {
    ...(env.NEXT_PUBLIC_GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
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
