import { createCallerFactory, router } from "./trpc";
import { taskRouter } from "./routers/task";

/** The app's root tRPC router. Add sub-routers here as the API grows. */
export const appRouter = router({
  task: taskRouter,
});

/** Exported type the client uses for end-to-end type safety. */
export type AppRouter = typeof appRouter;

/** Caller factory for server-side / test invocation with an explicit context. */
export const createCaller = createCallerFactory(appRouter);
