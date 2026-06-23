import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createTRPCContext } from "./context";
import { appRouter } from "./root";

/**
 * Same-origin guard. Server Actions get CSRF protection for free (Next.js
 * validates the Origin header), but a tRPC fetch handler does NOT — without this,
 * a page on another site could POST to `/api/trpc` and the browser would attach
 * the session cookie, reaching authenticated procedures. Same-origin browser
 * requests and server-side callers send no `Origin`, so an absent header is
 * treated as same-origin; a present, mismatching origin is rejected.
 */
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

/**
 * Fetch-adapter handler for the App Router. Wrapping it here keeps `@trpc/server`
 * an implementation detail of `@repo/api` — the app's route file just forwards
 * the request.
 */
export function trpcHandler(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });
}
