import { db, desc, eq, task } from "@repo/db";

import { protectedProcedure, router } from "../trpc";

/**
 * Task router — the read-side mirror of the dashboard's RSC query, exposed over
 * tRPC. Owner-scoped: only ever returns the signed-in user's tasks. Mutations
 * remain Server Actions (see apps/web/app/dashboard/actions.ts). `db` is imported
 * directly (the libSQL singleton), like the Server Actions do.
 */
export const taskRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(task)
      .where(eq(task.userId, ctx.session.user.id))
      .orderBy(desc(task.createdAt));
  }),
});
