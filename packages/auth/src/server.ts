import { db, eq, schema } from "@repo/db";
import {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "@repo/email";
import { env } from "@repo/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";

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
    // Explicit password floor so the policy is auditable in code, not hidden in a
    // library default (Better Auth's default is also 8). A direct POST to
    // /api/auth/sign-up/email bypasses the form's client-side minLength, so this
    // server-side floor is the real enforcement point.
    minPasswordLength: 8,
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
  // RBAC via the vetted admin plugin (role/banned columns live in @repo/db).
  // Default adminRoles: ["admin"]. No hand-rolled authorization.
  plugins: [admin()],
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
          // Bootstrap: promote allow-listed emails (ADMIN_EMAILS) to role
          // "admin" at creation so the first admin exists with a real role (the
          // admin plugin authorizes its API on `role`). Awaited — a fast local
          // UPDATE — so the role is set before the account is useful. Empty
          // ADMIN_EMAILS → no-op.
          //
          // SECURITY: this grant is only safe when email verification is ON
          // (`requireEmailVerification` above is `isEmailConfigured()`). With NO
          // email provider, verification is OFF, so an attacker could sign up as
          // an UNCLAIMED allow-listed address and get an admin session at once.
          // In an email-less production, prefer the `promote-admin` script over
          // ADMIN_EMAILS. See @repo/auth CLAUDE.md.
          const adminEmails = (env.ADMIN_EMAILS ?? "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
          if (adminEmails.includes(user.email.toLowerCase())) {
            await db
              .update(schema.user)
              .set({ role: "admin" })
              .where(eq(schema.user.id, user.id));
          }
          // Welcome email stays best-effort and must never break/block sign-up.
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
