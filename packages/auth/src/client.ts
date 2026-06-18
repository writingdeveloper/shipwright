import { createAuthClient } from "better-auth/react";

/**
 * Typed Better Auth client for use in client components.
 *
 * `baseURL` is read from `NEXT_PUBLIC_BETTER_AUTH_URL` when present, otherwise
 * it falls back to same-origin (the browser's current origin), which is the
 * correct default when the auth handler is mounted in the same Next.js app.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
