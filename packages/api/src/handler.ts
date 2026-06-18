import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createTRPCContext } from "./context";
import { appRouter } from "./root";

/**
 * Fetch-adapter handler for the App Router. Wrapping it here keeps `@trpc/server`
 * an implementation detail of `@repo/api` — the app's route file just forwards
 * the request.
 */
export function trpcHandler(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });
}
