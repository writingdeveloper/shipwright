import { env } from "@repo/env";
import { createAuthClient } from "better-auth/react";

/**
 * Typed Better Auth client for use in client components.
 *
 * `baseURL` is read from the validated `NEXT_PUBLIC_BETTER_AUTH_URL` when
 * present, otherwise it falls back to same-origin (the browser's current
 * origin), which is the correct default when the auth handler is mounted in the
 * same Next.js app.
 *
 * NOTE (SP1): the server `admin()` plugin (see `./server.ts`) already supplies
 * `role` on the session — all SP1's admin gate needs. The matching
 * `adminClient()` plugin (for client-side `authClient.admin.*` calls like
 * listUsers/setRole) is intentionally deferred to SP2, where it is first used:
 * adding it here changes the inferred client type so the convenience
 * re-exports below can no longer be named portably (TS2742), and SP1 calls no
 * admin method client-side. Add it in SP2 alongside its first consumer.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_BETTER_AUTH_URL,
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
