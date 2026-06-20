import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@repo/auth/server";

/**
 * Shared auth gate for the dashboard's Server Actions (task / push / billing).
 *
 * Auth is verified at the DATA LAYER (repo rule) — never trusting the page or
 * middleware to have gated the call. A missing session `redirect`s to sign-in
 * rather than throwing a raw error to the client. Defined once here so the three
 * action files don't each re-implement the same getSession + redirect dance.
 *
 * Importing `next/headers` makes this module server-only: a client component
 * that tried to import it would fail to build.
 */
export async function requireSession(): Promise<Session> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

/** Convenience for the common case: just the signed-in user's id. */
export async function requireUserId(): Promise<string> {
  const session = await requireSession();
  return session.user.id;
}
