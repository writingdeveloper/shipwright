# @repo/api — Claude Code rules

Opt-in tRPC v11 layer. NOT a replacement for Server Actions — mutations stay
Server Actions (CSRF, progressive enhancement); tRPC is the vetted type-safe
client-query path. Ships with a real consumer (dashboard `task.list` demo).

- **Surfaces:** `@repo/api` (server: `appRouter`, `AppRouter` type,
  `createTRPCContext`, `trpcHandler`, `createCaller`) and `@repo/api/client`
  (`TRPCReactProvider`, `useTRPC`). The fetch adapter is wrapped in `trpcHandler`
  so the app never imports `@trpc/server` directly.
- **Context** (`context.ts`) is `{ session }` — the Better Auth session from
  `auth.api.getSession({ headers })`. `db` is intentionally NOT on the context:
  resolvers import the libSQL `db` singleton from `@repo/db` directly (the Server
  Action pattern), which also keeps `@libsql/client` out of this package's
  exported type surface (avoids TS2742). `protectedProcedure` throws
  `UNAUTHORIZED` and narrows `session` to non-null; resolvers stay owner-scoped
  (`ctx.session.user.id`).
- **superjson** transformer on BOTH `initTRPC.create` and the client
  `httpBatchLink` so `Date` (e.g. `task.createdAt`) round-trips. Keep them in sync.
- **Client is dashboard-scoped:** `TRPCReactProvider` is mounted in
  `apps/web/app/dashboard/layout.tsx`, not the root layout. Same-origin
  `/api/trpc` is covered by CSP `connect-src 'self'` — no CSP change. The
  consuming app must depend on `@tanstack/react-query` directly (it calls
  `useQuery`).
- **Add a procedure:** new router in `src/routers/`, mount in `src/root.ts`. Use
  `protectedProcedure` for anything user-scoped. The exported `AppRouter` type is
  the client's single source of truth — no codegen. Add `zod` for input
  validation when the first input-bearing procedure lands.
- Tests set `SKIP_ENV_VALIDATION` in `test/setup.ts` (the context imports
  `@repo/env` via auth). The guard test uses `createCaller({ session: null })`.
