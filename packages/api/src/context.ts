import { auth } from "@repo/auth/server";

/**
 * Per-request tRPC context. Resolves the Better Auth session from the request
 * headers. `session` is null for anonymous callers; `protectedProcedure` (see
 * ./trpc) narrows it to non-null.
 *
 * `db` is intentionally NOT on the context — resolvers import the libSQL `db`
 * singleton from `@repo/db` directly (the same pattern the Server Actions use),
 * which also keeps `@libsql/client` out of this package's exported type surface.
 */
export async function createTRPCContext({ headers }: { headers: Headers }) {
  const session = await auth.api.getSession({ headers });
  return { session };
}

/** The resolved context type shared by every procedure. */
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
