import { env } from "@repo/env";
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

/**
 * Typed Better Auth client for use in client components.
 *
 * `baseURL` is read from the validated `NEXT_PUBLIC_BETTER_AUTH_URL` when
 * present, otherwise it falls back to same-origin (the browser's current
 * origin), which is the correct default when the auth handler is mounted in the
 * same Next.js app.
 *
 * The `adminClient()` plugin mirrors the server `admin()` plugin, exposing
 * `authClient.admin.*` (listUsers/setRole/banUser/…) for the admin app's user
 * management (consumed in SP2). Keeping client/server plugins in lockstep is the
 * same discipline as the superjson transformer pairing in `@repo/api`.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [adminClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} = authClient;
