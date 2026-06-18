/**
 * @repo/api — opt-in tRPC layer (server surface). Import the client from
 * `@repo/api/client`. Server Actions remain the default mutation path; this is
 * the vetted type-safe client-query layer.
 */
export { appRouter, type AppRouter, createCaller } from "./root";
export { createTRPCContext, type Context } from "./context";
export { trpcHandler } from "./handler";
