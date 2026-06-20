/**
 * @repo/email — transactional email via Resend + React Email.
 *
 * Two concerns, also importable via subpaths:
 * - `@repo/email/welcome-email` → `<WelcomeEmail>` (a pure React Email template,
 *   parameterised by `name`/`appName`; renders to HTML, safe to unit-test).
 * - `@repo/email/send` → `sendEmail(...)` / `sendWelcomeEmail({ to, name })`,
 *   the SERVER-SIDE send helpers.
 *
 * GRACEFUL DEGRADATION: the send helpers read `RESEND_API_KEY` + `EMAIL_FROM`
 * from `@repo/env` (both OPTIONAL). When either is absent they log a single
 * warning and return `{ skipped: true }` WITHOUT throwing, so the app, tests,
 * and CI run with no email account and a transient email failure can never
 * break the request (e.g. sign-up) that triggered it.
 *
 * The send module is server-only by contract (it reads a server secret). Import
 * it from server code (a Server Action / Route Handler / Better Auth hook), not
 * a client component. The template is safe to import anywhere.
 */

export {
  WelcomeEmail,
  type WelcomeEmailProps,
} from "./welcome-email";

export {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from "./password-reset-email";

export { VerifyEmail, type VerifyEmailProps } from "./verify-email";

export {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  type SendResult,
  type SendEmailArgs,
  type SendWelcomeEmailArgs,
} from "./send";

export { isEmailConfigured } from "./config";
