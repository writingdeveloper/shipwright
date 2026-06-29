import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth, type Session } from "@repo/auth/server";

/**
 * Admin gate, verified at the DATA LAYER (repo rule — never trust the layout
 * alone). Mirrors apps/web's `requireSession`, but additionally requires
 * role "admin":
 *   - no session            → redirect to /sign-in
 *   - signed in, not admin  → notFound() (404 — don't acknowledge the surface)
 *
 * Single source of truth is `user.role` (supplied by the Better Auth `admin()`
 * plugin); the ADMIN_EMAILS allowlist only SEEDS that role at sign-up (see the
 * @repo/auth server create-hook). Importing `next/headers` makes this module
 * server-only.
 */
export async function requireAdminSession(): Promise<Session> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  if (session.user.role !== "admin") {
    notFound();
  }
  return session;
}

/** Convenience: the signed-in admin's user id. */
export async function requireAdmin(): Promise<string> {
  const session = await requireAdminSession();
  return session.user.id;
}
