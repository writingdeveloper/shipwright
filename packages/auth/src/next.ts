import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "./server";

/**
 * Pre-wired Next.js App Router route handlers for the Better Auth endpoints.
 * Mount from `app/api/auth/[...all]/route.ts`:
 *
 *   export { GET, POST } from "@repo/auth/next";
 *
 * Keeping `better-auth` an implementation detail of this package means the app
 * never needs to depend on it directly.
 */
export const { GET, POST } = toNextJsHandler(auth);
