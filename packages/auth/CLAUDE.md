# @repo/auth — Claude Code rules

Better Auth (email + password, email verification OFF), wired to `@repo/db` via the Drizzle adapter.

- **Consume via the boundary, never `better-auth` directly.** Imports:
  - server: `import { auth } from "@repo/auth/server"` → `await auth.api.getSession({ headers: await headers() })`
  - client: `import { authClient } from "@repo/auth/client"` → `signIn.email` / `signUp.email` / `signOut`
  - Next route: `export { GET, POST } from "@repo/auth/next"`
- **Authorize inside every server action / route handler**, not just middleware or the page — a signed-out or non-owner request must be rejected at the data layer.
- Secrets come from `@repo/env` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`). Never read `process.env` here.
- **Self-serve account deletion is enabled** (`user.deleteUser.enabled`) — the endpoint verifies the session + supplied password; owner-table rows cascade via the schema FKs. EXTERNAL resources are the app's job: `apps/web`'s `deleteAccount` action snapshots the Stripe subscription id + S3 keys BEFORE deleting and cleans them up after (keeps this package decoupled from payments/storage). `APIError` is re-exported from `/server` so apps can branch on auth API errors without importing `better-auth` directly.
- Server-only: do not import `/server` into client components.
- **RBAC (admin plugin):** `ADMIN_EMAILS` auto-promotes a sign-up to `role:"admin"` via the
  `databaseHooks.user.create.after` hook. **Security caveat — only safe when email verification
  is ON.** Verification is dynamic (`requireEmailVerification: isEmailConfigured()`), so a
  deployment with NO email provider (`@repo/email` unconfigured) has it OFF; there, anyone could
  sign up as an *unclaimed* allow-listed address and get an admin session immediately. So: in
  production using `ADMIN_EMAILS`, configure Resend (verification gates the session) OR seed the
  first admin with `pnpm --filter @repo/auth promote-admin <email>` and leave `ADMIN_EMAILS`
  unset. Keyless local dev is fine (it's your machine).
- **Admin self-protection is app-layer only.** `apps/admin`'s Server Actions block acting on your
  own account, but the raw Better Auth admin endpoints (`/api/auth/admin/*`) are NOT app-gated:
  the plugin blocks self-ban/self-remove but NOT self-`set-role`, and nothing enforces a
  "last admin" invariant (two admins can demote each other to zero). This is a self-inflicted
  availability footgun, not an escalation (CSRF-protected). Recover a zero-admin DB with
  `promote-admin`.
