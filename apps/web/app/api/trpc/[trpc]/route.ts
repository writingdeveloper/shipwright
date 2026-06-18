import { trpcHandler } from "@repo/api";

/**
 * tRPC endpoint (App Router fetch handler). The handler is owned by `@repo/api`;
 * this file just forwards GET/POST. Auth is enforced per-procedure in the router
 * (protectedProcedure), so this route needs no separate gate. The proxy matcher
 * already excludes /api/* from the page-CSP pass.
 */
export function GET(req: Request): Promise<Response> {
  return trpcHandler(req);
}

export function POST(req: Request): Promise<Response> {
  return trpcHandler(req);
}
