# @repo/auth — Claude Code rules

Better Auth (email + password, email verification OFF), wired to `@repo/db` via the Drizzle adapter.

- **Consume via the boundary, never `better-auth` directly.** Imports:
  - server: `import { auth } from "@repo/auth/server"` → `await auth.api.getSession({ headers: await headers() })`
  - client: `import { authClient } from "@repo/auth/client"` → `signIn.email` / `signUp.email` / `signOut`
  - Next route: `export { GET, POST } from "@repo/auth/next"`
- **Authorize inside every server action / route handler**, not just middleware or the page — a signed-out or non-owner request must be rejected at the data layer.
- Secrets come from `@repo/env` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`). Never read `process.env` here.
- Server-only: do not import `/server` into client components.
