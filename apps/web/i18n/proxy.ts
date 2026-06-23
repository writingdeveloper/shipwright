import { type NextRequest, type NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./routing";

const intlMiddleware = createMiddleware(routing);

/**
 * i18n locale-routing seam for `apps/web/proxy.ts` — the ONLY i18n footprint in
 * the request pipeline. `withCsp` calls this and layers the per-request nonce CSP
 * onto the result.
 *
 * To opt out of i18n entirely, swap the body for `return NextResponse.next();`
 * (importing `NextResponse` as a value) and drop the next-intl import — `withCsp`
 * handles a plain `next()` unchanged, so no surgery on the CSP/rate-limit code.
 */
export function applyI18n(request: NextRequest): NextResponse {
  return intlMiddleware(request);
}
