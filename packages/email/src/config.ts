import { env } from "@repo/env";

/**
 * @repo/email — the "is transactional email even configured?" predicate.
 *
 * Pure (reads only `@repo/env`), no Resend import — so server code that must
 * BRANCH on email config (e.g. Better Auth's dynamic `requireEmailVerification`)
 * can import it cheaply. Mirrors `@repo/analytics/config`'s `isXEnabled()` shape.
 */
export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}
