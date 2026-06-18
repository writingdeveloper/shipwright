import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import type { Context } from "./context";

/**
 * tRPC initialisation. `superjson` transformer so rich types (e.g. `Date`)
 * round-trip between server and client. Exposes the building blocks the routers
 * and the caller factory (for tests) need.
 */
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** A procedure anyone can call. */
export const publicProcedure = t.procedure;

/**
 * A procedure that requires a signed-in user. Throws UNAUTHORIZED when there is
 * no session, and narrows `ctx.session` to non-null for downstream resolvers.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
